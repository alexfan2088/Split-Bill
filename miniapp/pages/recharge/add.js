// pages/recharge/add.js
const db = require('../../utils/db.js');
const app = getApp();

Page({
  data: {
    activityId: '',
    amount: '',
    date: '',
    payerList: [],
    selectedPayer: '',
    keeper: '', // 保管人员
    keeperList: [], // 保管人员列表
  },

  onLoad(options) {
    if (options.activityId) {
      this.setData({ activityId: options.activityId });
      this.loadActivityMembers();
      this.initDate();
    }
  },

  initDate() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    this.setData({ date: `${year}-${month}-${day}` });
  },

  async loadActivityMembers() {
    try {
      const dbCloud = wx.cloud.database();
      const activityId = this.data.activityId;

      // 加载活动的group（获取最新成员列表）
      const groupRes = await dbCloud.collection('groups')
        .where({ activityId: activityId })
        .limit(1)
        .get();

      let members = [];
      if (groupRes.data && groupRes.data.length > 0) {
        members = groupRes.data[0].members || [];
      } else {
        // 如果没有group，从activity中获取
        const actRes = await dbCloud.collection('activities').doc(activityId).get();
        members = actRes.data.members || [];
      }

      const payerList = members.map(m => ({
        name: typeof m === 'string' ? m : m.name
      }));

      // 加载活动的保管人员
      const actRes = await dbCloud.collection('activities').doc(activityId).get();
      const activity = actRes.data;
      const keeper = activity.keeper || '';
      
      this.setData({ 
        payerList,
        keeper, // 保管人员固定为活动的保管人员，不可修改
        keeperList: payerList
      });
    } catch (e) {
      console.error('加载活动成员失败:', e);
      wx.showToast({
        title: '加载成员失败',
        icon: 'none'
      });
    }
  },

  onAmountInput(e) {
    this.setData({ amount: e.detail.value });
  },

  onDateChange(e) {
    this.setData({ date: e.detail.value });
  },

  selectPayer(e) {
    const payer = e.currentTarget.dataset.name;
    this.setData({ selectedPayer: payer });
  },

  async saveRecharge() {
    const amount = Number(this.data.amount);
    if (!amount || amount <= 0) {
      wx.showToast({
        title: '金额必须大于0',
        icon: 'none'
      });
      return;
    }

    if (!this.data.selectedPayer) {
      wx.showToast({
        title: '请选择充值人员',
        icon: 'none'
      });
      return;
    }

    if (!this.data.keeper) {
      wx.showToast({
        title: '活动未设置保管人员，请先编辑活动设置保管人员',
        icon: 'none',
        duration: 3000
      });
      return;
    }

    wx.showLoading({
      title: '保存中...'
    });

    try {
      const dbCloud = wx.cloud.database();
      const userName = db.getCurrentUser();

      // 组合日期
      const dateStr = this.data.date; // 格式：yyyy-MM-dd
      const date = new Date(`${dateStr}T00:00:00`);

      await dbCloud.collection('recharges').add({
        data: {
          activityId: this.data.activityId,
          amount: amount,
          payer: this.data.selectedPayer,
          keeper: this.data.keeper,
          date: date,
          creator: userName,
          createdAt: new Date()
        }
      });

      wx.hideLoading();
      wx.showToast({
        title: '保存成功',
        icon: 'success'
      });

      // 返回上一页
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
    } catch (e) {
      wx.hideLoading();
      console.error('保存充值失败:', e);
      wx.showToast({
        title: '保存失败',
        icon: 'none'
      });
    }
  },
});

