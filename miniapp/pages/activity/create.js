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
    isPrepaid: false, // 是否打平伙
    originalIsPrepaid: false, // 原始活动的打平伙状态（用于编辑时判断）
    showPrepaidOption: true, // 是否显示打平伙选项
    keeper: '', // 保管人员
    keeperList: [], // 保管人员列表（从成员中选择）
    creator: '', // 活动创建者
    defaultTypes: ['聚餐', '秋秋妹', '麻将', '掼蛋', '公园'], // 系统默认类型（不可删除）
    commonTypes: ['聚餐', '秋秋妹', '麻将', '掼蛋', '公园'], // 常用类型（包含系统类型和自定义类型）
    remarkEditing: false, // 备注是否在编辑状态
  },
  
  async onLoad(options) {
    // 获取当前用户（创建者）
    const userName = db.getCurrentUser();
    this.setData({ creator: userName });
    
    // 加载常用类型列表（从数据库）
    await this.loadCommonTypes();
    
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
        
        const originalIsPrepaid = activity.isPrepaid || false;
        this.setData({
          isEdit: true,
          activityId: activity._id,
          name: activity.name || '',
          type: activity.type || '',
          membersText: memberNames.join('\n'),
          remark: activity.remark || '',
          remarkEditing: true, // 编辑模式始终显示textarea
          isPrepaid: originalIsPrepaid,
          originalIsPrepaid: originalIsPrepaid, // 保存原始值
          showPrepaidOption: originalIsPrepaid, // 只有原始活动是打平伙时才显示
          keeper: activity.keeper || '',
          keeperList: memberNames.map(name => ({ name })),
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
      
      // 自动填写备注说明
      const defaultRemark = '默认方式：A B C 每次费用轮流付款，长期会平衡，也可以通过 结算 页面的余额信息，线下转账强制平衡后，补录账单实现账务清零，默认模式也可以用于人情账记账，例如小孩结婚，升学，吃席等。\n打平伙模式：A B C 提前转到A 那里，A 保管费用，每次费用A 来付款，费用结算页面可以看到当前余额，如果某一个人余额为负，则应自觉去A那里充值。';
      this.setData({
        remark: defaultRemark
      });
      
      wx.setNavigationBarTitle({
        title: '创建活动'
      });
    }
  },
  
  onNameInput(e) {
    this.setData({ name: e.detail.value });
  },
  
  // 加载常用类型列表（从数据库）
  async loadCommonTypes() {
    try {
      const dbCloud = wx.cloud.database();
      // 查询当前用户的自定义活动类型
      const res = await dbCloud.collection('userCustomActivityTypes')
        .orderBy('createdAt', 'desc')
        .get();
      
      const savedCustomTypes = (res.data || []).map(item => item.type);
      
      // 合并默认类型和保存的自定义类型，去重
      const defaultTypes = this.data.defaultTypes;
      const allTypes = [...new Set([...defaultTypes, ...savedCustomTypes])];
      this.setData({ commonTypes: allTypes });
    } catch (e) {
      console.error('加载常用类型失败:', e);
      // 如果查询失败，只使用默认类型
      this.setData({ commonTypes: this.data.defaultTypes });
    }
  },
  
  // 保存新类型到数据库（只保存自定义类型）
  async saveCustomTypeToDB(newType) {
    try {
      const dbCloud = wx.cloud.database();
      // 检查该类型是否已存在
      const checkRes = await dbCloud.collection('userCustomActivityTypes')
        .where({ type: newType })
        .get();
      
      if (checkRes.data && checkRes.data.length > 0) {
        // 类型已存在，不需要重复保存
        return;
      }
      
      // 保存新类型到数据库
      await dbCloud.collection('userCustomActivityTypes').add({
        data: {
          type: newType,
          createdAt: new Date()
        }
      });
    } catch (e) {
      console.error('保存自定义类型到数据库失败:', e);
    }
  },
  
  // 选择常用类型
  selectType(e) {
    const selectedType = e.currentTarget.dataset.type;
    this.setData({ type: selectedType });
  },
  
  // 长按删除自定义类型
  async deleteType(e) {
    const typeToDelete = e.currentTarget.dataset.type;
    const defaultTypes = this.data.defaultTypes;
    
    // 检查是否是系统默认类型
    if (defaultTypes.includes(typeToDelete)) {
      wx.showToast({
        title: '系统类型不可删除',
        icon: 'none',
        duration: 2000
      });
      return;
    }
    
    // 确认删除
    wx.showModal({
      title: '确认删除',
      content: `确定要删除类型"${typeToDelete}"吗？`,
      success: async (res) => {
        if (res.confirm) {
          // 从数据库删除
          try {
            const dbCloud = wx.cloud.database();
            const deleteRes = await dbCloud.collection('userCustomActivityTypes')
              .where({ type: typeToDelete })
              .get();
            
            if (deleteRes.data && deleteRes.data.length > 0) {
              // 删除所有匹配的文档（理论上每个用户每种类型只有一个）
              for (const doc of deleteRes.data) {
                await dbCloud.collection('userCustomActivityTypes').doc(doc._id).remove();
              }
            }
          } catch (e) {
            console.error('从数据库删除类型失败:', e);
            wx.showToast({
              title: '删除失败',
              icon: 'none'
            });
            return;
          }
          
          // 从常用类型列表中删除
          const updatedTypes = this.data.commonTypes.filter(type => type !== typeToDelete);
          this.setData({ commonTypes: updatedTypes });
          
          // 如果当前选中的类型被删除，清空输入框
          if (this.data.type === typeToDelete) {
            this.setData({ type: '' });
          }
          
          wx.showToast({
            title: '已删除',
            icon: 'success',
            duration: 1500
          });
        }
      }
    });
  },
  
  onTypeInput(e) {
    this.setData({ type: e.detail.value });
  },
  
  // 类型输入框失去焦点时，如果输入了新类型，自动添加到常用类型
  async onTypeBlur(e) {
    const newType = e.detail.value.trim();
    if (newType && !this.data.commonTypes.includes(newType)) {
      // 检查是否是系统默认类型
      const defaultTypes = this.data.defaultTypes;
      if (!defaultTypes.includes(newType)) {
        // 新类型，保存到数据库
        await this.saveCustomTypeToDB(newType);
        // 添加到常用类型列表
        const updatedTypes = [...this.data.commonTypes, newType];
        this.setData({ commonTypes: updatedTypes });
      }
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
          
          // 如果已经选择了打平伙，同步更新保管人员列表
          if (this.data.isPrepaid) {
            this.setData({
              keeperList: newLines.map(name => ({ name }))
            });
          }
        }
      });
      return; // 不更新输入框，等待对话框关闭后自动恢复
    }
    
    this.setData({ membersText: inputValue });
    
    // 如果已经选择了打平伙，同步更新保管人员列表
    if (this.data.isPrepaid) {
      const memberNames = inputValue.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);
      this.setData({
        keeperList: memberNames.map(name => ({ name }))
      });
    }
  },
  
  onRemarkInput(e) {
    this.setData({ 
      remark: e.detail.value,
      remarkEditing: true // 用户开始编辑，标记为编辑状态
    });
  },
  
  // 开始编辑备注
  startEditRemark() {
    this.setData({ remarkEditing: true });
  },
  
  // 切换打平伙选项
  togglePrepaid(e) {
    // 如果是编辑模式且原始活动是打平伙，不允许修改
    if (this.data.isEdit && this.data.originalIsPrepaid) {
      return;
    }
    const isPrepaid = e.detail.value;
    this.setData({ isPrepaid });
    
    // 如果选择打平伙，初始化保管人员列表
    if (isPrepaid && this.data.membersText) {
      const memberNames = this.data.membersText.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);
      this.setData({
        keeperList: memberNames.map(name => ({ name }))
      });
    }
  },
  
  // 选择保管人员
  selectKeeper(e) {
    const keeper = e.currentTarget.dataset.name;
    this.setData({ keeper });
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
    
    if (!type) {
      wx.showModal({
        title: '提示',
        content: '请选择或输入活动类型',
        showCancel: false,
        confirmText: '确定'
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
        const updateData = {
          name,
          type,
          remark,
          isPrepaid: this.data.isPrepaid,
          members,
          memberNames,
          updatedAt: new Date()
        };
        // 如果是打平伙活动，保存保管人员
        if (this.data.isPrepaid) {
          updateData.keeper = this.data.keeper;
        }
        await dbCloud.collection('activities').doc(this.data.activityId).update({
          data: updateData
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
        console.log('创建活动，isPrepaid:', this.data.isPrepaid);
        const createData = {
          name,
          type,
          remark,
          isPrepaid: this.data.isPrepaid,
          members,
          memberNames,
          creator: userName,
          createdAt: new Date()
        };
        // 如果是打平伙活动，保存保管人员
        if (this.data.isPrepaid) {
          createData.keeper = this.data.keeper;
        }
        const actRes = await dbCloud.collection('activities').add({
          data: createData
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
        // 检查是否是系统默认类型
        const defaultTypes = this.data.defaultTypes;
        if (!defaultTypes.includes(type)) {
          // 新类型，保存到数据库
          await this.saveCustomTypeToDB(type);
          // 添加到常用类型列表
          const updatedTypes = [...this.data.commonTypes, type];
          this.setData({ commonTypes: updatedTypes });
        }
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


