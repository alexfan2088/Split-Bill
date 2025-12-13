# 腾讯云开发 SDK 本地部署指南

## 问题
如果无法从 CDN 加载 SDK（网络限制），可以将 SDK 下载到本地使用。

## 步骤

### 1. 下载 SDK 文件

访问以下任一链接下载：
- https://unpkg.com/tcb-js-sdk@latest/dist/index.js
- https://cdn.jsdelivr.net/npm/tcb-js-sdk@1.9.0/dist/index.js

**方法：**
1. 在浏览器中打开上述链接
2. 右键 -> 另存为
3. 保存为 `tcb-js-sdk.js` 到 `dist` 目录

### 2. 修改 index.html

将：
```html
<script src="https://unpkg.com/tcb-js-sdk@latest/dist/index.js"></script>
```

改为：
```html
<script src="./tcb-js-sdk.js"></script>
```

### 3. 测试

刷新页面，SDK 应该能正常加载了。

## 注意事项

- 确保 `tcb-js-sdk.js` 文件在 `dist` 目录下
- 文件名必须与代码中的路径一致
- 如果更新 SDK，需要重新下载文件

