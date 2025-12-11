const cloud = require('@cloudbase/node-sdk');

// 需要备份的集合列表
const COLLECTIONS = [
  'users',
  'activities',
  'groups',
  'bills',
  'customActivityTypes'
];

/**
 * 云函数入口函数
 * 每天凌晨3:00自动备份所有数据库集合
 */
exports.main = async (event, context) => {
  const app = cloud.init({
    env: context.TCB_ENV || cloud.SYMBOL_CURRENT_ENV
  });
  const db = app.database();
  const storage = app.storage();

  const backupData = {
    timestamp: new Date().toISOString(),
    collections: {}
  };

  try {
    // 备份每个集合
    for (const collectionName of COLLECTIONS) {
      console.log(`开始备份集合: ${collectionName}`);
      
      try {
        // 查询集合中的所有数据
        const result = await db.collection(collectionName)
          .limit(10000) // 限制最多10000条，可根据需要调整
          .get();
        
        const data = result.data || [];
        backupData.collections[collectionName] = data;
        
        console.log(`集合 ${collectionName} 备份完成，共 ${data.length} 条记录`);
      } catch (error) {
        console.error(`备份集合 ${collectionName} 失败:`, error);
        backupData.collections[collectionName] = {
          error: error.message,
          data: []
        };
      }
    }

    // 生成备份文件名（格式：backup_YYYY-MM-DD_HH-mm-ss.json）
    const now = new Date();
    const dateStr = now.toISOString().replace(/[:.]/g, '-').split('T')[0];
    const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');
    const fileName = `backups/backup_${dateStr}_${timeStr}.json`;

    // 将备份数据转换为JSON字符串
    const backupJson = JSON.stringify(backupData, null, 2);

    // 上传到云存储
    const uploadResult = await storage.uploadFile({
      cloudPath: fileName,
      fileContent: Buffer.from(backupJson, 'utf-8')
    });

    console.log('备份文件上传成功:', uploadResult.fileID);

    // 可选：删除7天前的备份文件（节省存储空间）
    await cleanupOldBackups(storage, 7);

    return {
      success: true,
      message: '数据库备份成功',
      fileId: uploadResult.fileID,
      fileName: fileName,
      collections: Object.keys(backupData.collections).map(name => ({
        name,
        count: Array.isArray(backupData.collections[name]) 
          ? backupData.collections[name].length 
          : 0
      }))
    };
  } catch (error) {
    console.error('备份失败:', error);
    return {
      success: false,
      message: '数据库备份失败',
      error: error.message
    };
  }
};

/**
 * 清理旧的备份文件
 * @param {Object} storage 云存储实例
 * @param {Number} daysToKeep 保留天数
 */
async function cleanupOldBackups(storage, daysToKeep = 7) {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    
    // 列出所有备份文件
    const listResult = await storage.listFiles({
      prefix: 'backups/backup_',
      limit: 1000
    });

    if (listResult.fileList && listResult.fileList.length > 0) {
      for (const file of listResult.fileList) {
        // 从文件名中提取日期
        const fileName = file.fileID || file.name || '';
        const dateMatch = fileName.match(/backup_(\d{4}-\d{2}-\d{2})/);
        
        if (dateMatch) {
          const fileDate = new Date(dateMatch[1]);
          
          // 如果文件日期早于截止日期，删除它
          if (fileDate < cutoffDate) {
            try {
              await storage.deleteFile({
                fileList: [fileName]
              });
              console.log(`已删除旧备份文件: ${fileName}`);
            } catch (deleteError) {
              console.error(`删除文件失败 ${fileName}:`, deleteError);
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('清理旧备份文件失败:', error);
    // 不抛出错误，避免影响主备份流程
  }
}

