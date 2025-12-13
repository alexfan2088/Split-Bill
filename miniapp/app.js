// app.js
App({
  onLaunch() {
    // 注意：在手机上查看日志，请使用微信开发者工具的"真机调试"功能
    // 1. 点击工具栏的"真机调试"按钮
    // 2. 用手机扫描二维码
    // 3. 在开发者工具的Console中查看日志
    
    // 初始化云开发
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
      wx.showModal({
        title: '提示',
        content: '请使用 2.2.3 或以上的基础库以使用云能力',
        showCancel: false
      });
    } else {
      wx.cloud.init({
        env: 'cloud1-2gmpataie7b260ad', // 小程序专用云开发环境ID
        traceUser: true,
      });
      console.log('云开发初始化成功');
    }
    
    // 获取用户信息
    this.getUserInfo();
  },
  
  getUserInfo() {
    // 从本地存储获取用户名
    const userName = wx.getStorageSync('userName');
    if (userName) {
      this.globalData.currentUserName = userName;
      console.log('当前用户:', userName);
    }
  },
  
  globalData: {
    currentUserName: null,
    currentActivity: null,
    currentActivityBills: [],
    currentActivityBalances: {},
  }
});


