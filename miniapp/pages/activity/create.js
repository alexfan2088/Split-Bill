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
    creator: '', // 活动创建者
    commonTypes: ['聚餐', '秋秋妹', '四个朋友', '掼蛋', '公园'], // 常用类型
  },
  
  async onLoad(options) {
    // 获取当前用户（创建者）
    const userName = db.getCurrentUser();
    this.setData({ creator: userName });
    
    // 加载常用类型列表（从本地存储）
    this.loadCommonTypes();
    
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
        let memberNames = members.map(m => typeof m === 'string' ? m : m.name);
        
        // 确保创建者在第一位
        const creator = activity.creator || userName;
        memberNames = memberNames.filter(name => name !== creator); // 移除创建者（如果存在）
        memberNames.unshift(creator); // 将创建者添加到第一位
        
        this.setData({
          isEdit: true,
          activityId: activity._id,
          name: activity.name || '',
          type: activity.type || '',
          membersText: memberNames.join('\n'),
          remark: activity.remark || '',
          creator: creator,
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
    } else {
      // 新建模式，自动将创建者添加到第一位
      if (userName) {
        this.setData({
          membersText: userName
        });
      }
    }
  },
  
  onNameInput(e) {
    this.setData({ name: e.detail.value });
  },
  
  // 加载常用类型列表
  loadCommonTypes() {
    try {
      const savedTypes = wx.getStorageSync('aa_common_activity_types');
      if (savedTypes && Array.isArray(savedTypes) && savedTypes.length > 0) {
        // 合并默认类型和保存的类型，去重
        const defaultTypes = ['聚餐', '秋秋妹', '四个朋友', '掼蛋', '公园'];
        const allTypes = [...new Set([...defaultTypes, ...savedTypes])];
        this.setData({ commonTypes: allTypes });
      }
    } catch (e) {
      console.error('加载常用类型失败:', e);
    }
  },
  
  // 保存常用类型列表
  saveCommonTypes() {
    try {
      wx.setStorageSync('aa_common_activity_types', this.data.commonTypes);
    } catch (e) {
      console.error('保存常用类型失败:', e);
    }
  },
  
  // 选择常用类型
  selectType(e) {
    const selectedType = e.currentTarget.dataset.type;
    this.setData({ type: selectedType });
  },
  
  onTypeInput(e) {
    this.setData({ type: e.detail.value });
  },
  
  // 类型输入框失去焦点时，如果输入了新类型，自动添加到常用类型
  onTypeBlur(e) {
    const newType = e.detail.value.trim();
    if (newType && !this.data.commonTypes.includes(newType)) {
      // 新类型，添加到常用类型列表
      const updatedTypes = [...this.data.commonTypes, newType];
      this.setData({ commonTypes: updatedTypes });
      this.saveCommonTypes();
    }
  },
  
  onMembersInput(e) {
    const inputValue = e.detail.value;
    const previousValue = this.data.membersText;
    const creator = this.data.creator;
    
    if (!creator) {
      this.setData({ membersText: inputValue });
      return;
    }
    
    // 检查创建者是否被删除
    const previousLines = previousValue.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    const currentLines = inputValue.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    // 检查第一行是否是创建者（完整匹配）
    const firstLineIsCreator = currentLines.length > 0 && currentLines[0] === creator;
    
    // 如果之前第一行是创建者，但现在第一行不是创建者，说明创建者被删除了
    if (previousLines.length > 0 && previousLines[0] === creator && !firstLineIsCreator) {
      // 创建者被删除了，弹出对话框提示
      wx.showModal({
        title: '提示',
        content: '创建者不可删除，已自动恢复。',
        showCancel: false,
        confirmText: '确定',
        success: () => {
          // 清理所有行，移除第一行（可能是创建者的部分字符）和任何完全匹配创建者的行
          const cleanLines = currentLines.filter((name, index) => {
            // 移除第一行（可能是创建者的部分字符）
            if (index === 0) return false;
            // 移除完全匹配创建者的行
            if (name === creator) return false;
            return true;
          });
          
          // 确保创建者在第一位
          const newLines = [creator, ...cleanLines];
          this.setData({ membersText: newLines.join('\n') });
        }
      });
      return; // 不更新输入框，等待对话框关闭后自动恢复
    }
    
    this.setData({ membersText: inputValue });
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
    let memberNames = membersText.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
    
    // 确保创建者在第一位且不可删除
    const creator = this.data.creator || db.getCurrentUser();
    if (creator) {
      // 移除创建者（如果存在）
      memberNames = memberNames.filter(name => name !== creator);
      // 将创建者添加到第一位
      memberNames.unshift(creator);
    }
    
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
      
      // 如果输入了新类型，保存到常用类型列表
      if (type && !this.data.commonTypes.includes(type)) {
        const updatedTypes = [...this.data.commonTypes, type];
        this.setData({ commonTypes: updatedTypes });
        this.saveCommonTypes();
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


