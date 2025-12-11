// pages/activity/create.js
const db = require('../../utils/db.js');
const app = getApp();

Page({
  data: {
    isEdit: false,
    activityId: '',
    name: '',
    type: '',
    membersText: '',
    remark: '',
  },
  
  async onLoad(options) {
    if (options.id && options.data) {
      // 编辑模式
      try {
        const activity = JSON.parse(decodeURIComponent(options.data));
        
        // 从groups集合加载最新成员列表
        let members = activity.members || [];
        try {
          const dbCloud = wx.cloud.database();
          const groupRes = await dbCloud.collection('groups')
            .where({ activityId: activity._id })
            .limit(1)
            .get();
          
          if (groupRes.data && groupRes.data.length > 0 && groupRes.data[0].members) {
            members = groupRes.data[0].members;
          }
        } catch (e) {
          console.error('加载活动成员失败:', e);
          // 如果加载失败，使用activity中的members
          members = activity.members || [];
        }
        
        // 提取成员名称
        const memberNames = members.map(m => typeof m === 'string' ? m : m.name);
        
        this.setData({
          isEdit: true,
          activityId: activity._id,
          name: activity.name || '',
          type: activity.type || '',
          membersText: memberNames.join('\n'),
          remark: activity.remark || '',
        });
        wx.setNavigationBarTitle({
          title: '编辑活动'
        });
      } catch (e) {
        console.error('解析活动数据失败:', e);
        wx.showToast({
          title: '加载失败',
          icon: 'none'
        });
      }
    }
  },
  
  onNameInput(e) {
    this.setData({ name: e.detail.value });
  },
  
  onTypeInput(e) {
    this.setData({ type: e.detail.value });
  },
  
  onMembersInput(e) {
    this.setData({ membersText: e.detail.value });
  },
  
  onRemarkInput(e) {
    this.setData({ remark: e.detail.value });
  },
  
  async saveActivity() {
    const name = this.data.name.trim();
    const type = this.data.type.trim();
    const remark = this.data.remark.trim();
    const membersText = this.data.membersText.trim();
    
    if (!name) {
      wx.showToast({
        title: '请输入活动名称',
        icon: 'none'
      });
      return;
    }
    
    // 解析成员列表
    const memberNames = membersText.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
    
    if (memberNames.length === 0) {
      wx.showToast({
        title: '请至少添加一个成员',
        icon: 'none'
      });
      return;
    }
    
    const members = memberNames.map(name => ({
      name: name,
      active: true
    }));
    
    wx.showLoading({
      title: this.data.isEdit ? '更新中...' : '创建中...'
    });
    
    try {
      const userName = db.getCurrentUser();
      const dbCloud = wx.cloud.database();
      
      if (this.data.isEdit) {
        // 更新活动
        await dbCloud.collection('activities').doc(this.data.activityId).update({
          data: {
            name,
            type,
            remark,
            members,
            memberNames,
            updatedAt: new Date()
          }
        });
        
        // 更新活动的group
        const groupRes = await dbCloud.collection('groups')
          .where({ activityId: this.data.activityId })
          .limit(1)
          .get();
        
        if (groupRes.data && groupRes.data.length > 0) {
          await dbCloud.collection('groups').doc(groupRes.data[0]._id).update({
            data: {
              members: members,
              updatedAt: new Date()
            }
          });
        }
        
        wx.hideLoading();
        wx.showToast({
          title: '更新成功',
          icon: 'success'
        });
      } else {
        // 创建活动
        const actRes = await dbCloud.collection('activities').add({
          data: {
            name,
            type,
            remark,
            members,
            memberNames,
            creator: userName,
            createdAt: new Date()
          }
        });
        
        // 创建活动的group
        await dbCloud.collection('groups').add({
          data: {
            activityId: actRes._id,
            members: members,
            createdAt: new Date(),
            updatedAt: new Date()
          }
        });
        
        wx.hideLoading();
        wx.showToast({
          title: '创建成功',
          icon: 'success'
        });
      }
      
      // 返回上一页
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
    } catch (e) {
      wx.hideLoading();
      console.error('保存活动失败:', e);
      wx.showToast({
        title: '保存失败',
        icon: 'none'
      });
    }
  },
});


