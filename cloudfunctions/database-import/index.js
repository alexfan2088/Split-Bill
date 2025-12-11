const cloud = require('@cloudbase/node-sdk');

/**
 * 云函数入口函数
 * 从备份文件导入数据到数据库
 * 
 * 调用方式：
 * {
 *   "fileId": "cloud://xxx/backups/backup_2024-01-01_00-00-00.json",
 *   "collections": ["users", "activities", "bills"], // 可选，指定要导入的集合，不指定则导入所有
 *   "mode": "merge" // "merge" 合并模式（保留现有数据）或 "replace" 替换模式（清空后导入）
 * }
 */
exports.main = async (event, context) => {
  const app = cloud.init({
    env: context.TCB_ENV || cloud.SYMBOL_CURRENT_ENV
  });
  const db = app.database();
  const storage = app.storage();

  const { fileId, collections, mode = 'merge' } = event;

  if (!fileId) {
    return {
      success: false,
      message: '请提供备份文件ID (fileId)'
    };
  }

  try {
    // 从云存储下载备份文件
    console.log('下载备份文件:', fileId);
    const downloadResult = await storage.downloadFile({
      fileID: fileId
    });

    // 读取文件内容
    const fileContent = downloadResult.fileContent.toString('utf-8');
    const backupData = JSON.parse(fileContent);

    if (!backupData.collections) {
      return {
        success: false,
        message: '备份文件格式错误：缺少 collections 字段'
      };
    }

    const collectionsToImport = collections || Object.keys(backupData.collections);
    const importResults = {};

    // 导入每个集合
    for (const collectionName of collectionsToImport) {
      if (!backupData.collections[collectionName]) {
        console.warn(`备份文件中没有集合: ${collectionName}`);
        importResults[collectionName] = {
          success: false,
          message: '备份文件中不存在此集合'
        };
        continue;
      }

      // 如果是错误数据，跳过
      if (backupData.collections[collectionName].error) {
        console.warn(`集合 ${collectionName} 在备份时出错:`, backupData.collections[collectionName].error);
        importResults[collectionName] = {
          success: false,
          message: `备份时出错: ${backupData.collections[collectionName].error}`
        };
        continue;
      }

      const data = backupData.collections[collectionName];
      
      if (!Array.isArray(data) || data.length === 0) {
        console.log(`集合 ${collectionName} 没有数据，跳过`);
        importResults[collectionName] = {
          success: true,
          message: '集合为空，无需导入',
          count: 0
        };
        continue;
      }

      try {
        // 如果是替换模式，先清空集合
        if (mode === 'replace') {
          console.log(`清空集合: ${collectionName}`);
          // 注意：清空集合需要特殊权限，可能需要手动操作
          // 这里只是标记，实际清空操作建议在控制台手动完成
        }

        // 批量导入数据
        console.log(`开始导入集合 ${collectionName}，共 ${data.length} 条记录`);
        
        let successCount = 0;
        let failCount = 0;

        // 分批导入，每批100条
        const batchSize = 100;
        for (let i = 0; i < data.length; i += batchSize) {
          const batch = data.slice(i, i + batchSize);
          
          // 处理每条记录
          for (const doc of batch) {
            try {
              // 移除系统字段，避免冲突
              const docData = { ...doc };
              delete docData._id;
              delete docData._openid;

              if (mode === 'replace' && doc._id) {
                // 替换模式：使用原ID
                await db.collection(collectionName).doc(doc._id).set(docData);
              } else {
                // 合并模式：添加新记录
                await db.collection(collectionName).add(docData);
              }
              
              successCount++;
            } catch (docError) {
              console.error(`导入文档失败:`, docError);
              failCount++;
            }
          }
        }

        importResults[collectionName] = {
          success: true,
          message: '导入完成',
          total: data.length,
          success: successCount,
          failed: failCount
        };

        console.log(`集合 ${collectionName} 导入完成: 成功 ${successCount}，失败 ${failCount}`);
      } catch (error) {
        console.error(`导入集合 ${collectionName} 失败:`, error);
        importResults[collectionName] = {
          success: false,
          message: error.message
        };
      }
    }

    return {
      success: true,
      message: '数据导入完成',
      results: importResults,
      backupTimestamp: backupData.timestamp
    };
  } catch (error) {
    console.error('导入失败:', error);
    return {
      success: false,
      message: '数据导入失败',
      error: error.message
    };
  }
};

