# 数据库自动备份和导入指南

本指南说明如何设置每天凌晨3:00自动备份数据库，以及如何从备份文件导入数据。

## 一、部署云函数

### 1. 安装 CloudBase CLI

```bash
npm install -g @cloudbase/cli
```

### 2. 登录腾讯云

```bash
tcb login
```

### 3. 部署备份云函数

```bash
# 进入项目目录
cd cloudfunctions/database-backup

# 安装依赖
npm install

# 返回项目根目录
cd ../..

# 部署云函数
tcb fn deploy database-backup
```

### 4. 部署导入云函数

```bash
# 进入项目目录
cd cloudfunctions/database-import

# 安装依赖
npm install

# 返回项目根目录
cd ../..

# 部署云函数
tcb fn deploy database-import
```

## 二、配置定时触发器

### 1. 在腾讯云开发控制台配置

1. 登录 [腾讯云开发控制台](https://console.cloud.tencent.com/tcb)
2. 选择你的环境
3. 进入「云函数」页面
4. 找到 `database-backup` 函数
5. 点击「触发器」标签
6. 点击「新建触发器」
7. 配置如下：
   - **触发方式**：定时触发
   - **触发周期**：每天
   - **Cron 表达式**：`0 3 * * *` （每天凌晨3:00）
   - **触发名称**：daily-backup
8. 点击「确定」保存

### 2. Cron 表达式说明

- `0 3 * * *` - 每天凌晨3:00
- `0 0 * * *` - 每天凌晨0:00
- `0 */6 * * *` - 每6小时
- `0 0 * * 0` - 每周日凌晨0:00

更多 Cron 表达式格式请参考：[Cron 表达式](https://cloud.tencent.com/document/product/583/9708)

## 三、查看备份文件

### 1. 在控制台查看

1. 登录腾讯云开发控制台
2. 进入「云存储」页面
3. 查看 `backups` 文件夹
4. 备份文件命名格式：`backup_YYYY-MM-DD_HH-mm-ss.json`

### 2. 下载备份文件

可以通过控制台直接下载，或使用云函数下载。

## 四、导入备份数据

### 方式一：使用云函数导入（推荐）

#### 1. 在控制台调用

1. 进入「云函数」页面
2. 找到 `database-import` 函数
3. 点击「测试」或「在线调试」
4. 输入以下参数：

```json
{
  "fileId": "cloud://your-env-id.xxx/backups/backup_2024-01-01_00-00-00.json",
  "collections": ["users", "activities", "bills"],
  "mode": "merge"
}
```

参数说明：
- `fileId`: 备份文件的云存储路径（从云存储页面复制）
- `collections`: 可选，要导入的集合列表，不指定则导入所有
- `mode`: 导入模式
  - `merge`: 合并模式（保留现有数据，添加新数据）
  - `replace`: 替换模式（清空后导入，需要手动清空集合）

#### 2. 使用 CLI 调用

```bash
tcb fn invoke database-import --params '{
  "fileId": "cloud://your-env-id.xxx/backups/backup_2024-01-01_00-00-00.json",
  "collections": ["users", "activities", "bills"],
  "mode": "merge"
}'
```

### 方式二：手动导入（小数据量）

1. 下载备份 JSON 文件
2. 在控制台的「数据库」页面
3. 选择对应的集合
4. 点击「导入数据」
5. 上传 JSON 文件
6. 选择导入模式

**注意**：手动导入需要将备份文件格式转换为腾讯云数据库导入格式。

## 五、备份文件格式

备份文件是 JSON 格式，结构如下：

```json
{
  "timestamp": "2024-01-01T00:00:00.000Z",
  "collections": {
    "users": [
      {
        "_id": "xxx",
        "_openid": "xxx",
        "name": "用户名",
        "password": "加密密码",
        "createdAt": "2024-01-01T00:00:00.000Z"
      }
    ],
    "activities": [...],
    "groups": [...],
    "bills": [...],
    "customActivityTypes": [...]
  }
}
```

## 六、自动清理旧备份

备份云函数会自动清理7天前的备份文件，以节省存储空间。

如需修改保留天数，编辑 `cloudfunctions/database-backup/index.js` 中的 `cleanupOldBackups` 函数调用：

```javascript
await cleanupOldBackups(storage, 7); // 7 表示保留7天
```

## 七、注意事项

1. **权限设置**：
   - 确保云函数有数据库读取权限
   - 确保云函数有云存储读写权限

2. **数据量限制**：
   - 单次备份最多10000条记录（可在代码中调整）
   - 如果数据量很大，建议分批备份

3. **导入模式**：
   - `merge` 模式：适合增量恢复，不会覆盖现有数据
   - `replace` 模式：需要先手动清空集合，适合完全恢复

4. **备份频率**：
   - 建议每天备份一次
   - 重要数据可以增加备份频率

5. **存储成本**：
   - 备份文件会占用云存储空间
   - 定期清理旧备份可以节省成本

## 八、故障排查

### 备份失败

1. 检查云函数日志
2. 确认数据库权限设置
3. 确认云存储权限设置
4. 检查定时触发器是否正常

### 导入失败

1. 检查备份文件格式是否正确
2. 确认目标集合权限
3. 检查数据格式是否兼容
4. 查看云函数执行日志

## 九、扩展功能

### 备份到其他存储

可以修改备份云函数，将数据备份到：
- 腾讯云 COS
- 阿里云 OSS
- AWS S3
- 其他对象存储服务

### 邮件通知

可以在备份完成后发送邮件通知，添加邮件服务（如 SendGrid、阿里云邮件推送等）。

### 备份验证

可以添加备份验证功能，确保备份文件完整性。

