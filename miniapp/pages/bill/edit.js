// pages/bill/edit.js
const db = require('../../utils/db.js');
const app = getApp();

Page({
  data: {
    activityId: '',
    billId: '',
    isEdit: false,
    isReadOnly: false,
    amount: '',
    title: '',
    date: '',
    time: '',
    payerIndex: 0,
    payerList: [],
    participants: [],
    remark: '',
    isPrepaid: false, // 是否打平伙活动
    keeper: '', // 保管人员
    payerDisabled: false, // 付款人是否禁用
  },
  
  onLoad(options) {
    this.setData({ activityId: options.activityId || '' });
    
    // 检查是否是只读模式
    const isReadOnly = options.readOnly === 'true';
    this.setData({ isReadOnly });
    
    if (options.billId) {
      // 编辑/查看模式
      this.setData({ 
        billId: options.billId,
        isEdit: true 
      });
      this.loadBillData();
    } else {
      // 新建模式
      this.initNewBill();
    }
    
    this.loadActivityMembers();
    
    // 如果是只读模式，修改标题
    if (isReadOnly) {
      wx.setNavigationBarTitle({
        title: '账单详情'
      });
    }
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
      let activity = null;
      if (groupRes.data && groupRes.data.length > 0) {
        members = groupRes.data[0].members || [];
      } else {
        // 如果没有group，从activity中获取
        const actRes = await dbCloud.collection('activities').doc(activityId).get();
        activity = actRes.data;
        members = activity.members || [];
      }
      
      // 如果没有获取到activity，重新获取
      if (!activity) {
        const actRes = await dbCloud.collection('activities').doc(activityId).get();
        activity = actRes.data;
      }
      
      const payerList = members.map(m => ({
        name: typeof m === 'string' ? m : m.name
      }));
      
      // 检查是否是打平伙活动
      const isPrepaid = activity ? (activity.isPrepaid || false) : false;
      const keeper = activity ? (activity.keeper || '') : '';
      
      // 如果是打平伙活动，付款人默认为保管人员，且不可更改
      let payerIndex = 0;
      let payerDisabled = false;
      if (isPrepaid && keeper) {
        const keeperIndex = payerList.findIndex(p => p.name === keeper);
        if (keeperIndex >= 0) {
          payerIndex = keeperIndex;
          payerDisabled = true;
        }
      } else {
        // 如果不是打平伙活动，设置默认付款人为当前用户
        if (!this.data.isEdit && payerList.length > 0) {
          const userName = db.getCurrentUser();
          const defaultPayerIndex = payerList.findIndex(p => p.name === userName);
          if (defaultPayerIndex >= 0) {
            payerIndex = defaultPayerIndex;
          }
        }
      }
      
      this.setData({ 
        payerList,
        payerIndex,
        isPrepaid,
        keeper,
        payerDisabled
      });
    } catch (e) {
      console.error('加载活动成员失败:', e);
      wx.showToast({
        title: '加载成员失败',
        icon: 'none'
      });
    }
  },
  
  async initNewBill() {
    // 设置默认时间
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    
    this.setData({
      date: `${year}-${month}-${day}`,
      time: `${hours}:${minutes}`,
    });
    
    // 加载活动成员并继承最近一次账单的权重
    await this.loadParticipantsWithInheritance();
  },
  
  async loadParticipantsWithInheritance() {
    try {
      const dbCloud = wx.cloud.database();
      const activityId = this.data.activityId;
      
      // 查询最近一次账单
      let lastBillParticipants = null;
      try {
        const lastBillRes = await dbCloud.collection('bills')
          .where({ activityId: activityId })
          .orderBy('createdAt', 'desc')
          .limit(1)
          .get();
        
        if (lastBillRes.data && lastBillRes.data.length > 0) {
          lastBillParticipants = lastBillRes.data[0].participants || null;
        }
      } catch (e) {
        console.log('查询最近一次账单失败（可能没有索引）:', e);
      }
      
      // 加载成员列表
      const groupRes = await dbCloud.collection('groups')
        .where({ activityId: activityId })
        .limit(1)
        .get();
      
      let members = [];
      if (groupRes.data && groupRes.data.length > 0) {
        members = groupRes.data[0].members || [];
      }
      
      // 生成参与成员列表，继承权重
      const participants = members.map(m => {
        const name = typeof m === 'string' ? m : m.name;
        let weight = 2; // 默认权重为2
        
        if (lastBillParticipants && lastBillParticipants.hasOwnProperty(name)) {
          weight = Number(lastBillParticipants[name]) || 0;
        }
        
        return { name, weight };
      });
      
      this.setData({ participants });
    } catch (e) {
      console.error('加载参与成员失败:', e);
    }
  },
  
  async loadBillData() {
    wx.showLoading({ title: '加载中...' });
    
    try {
      const dbCloud = wx.cloud.database();
      const billRes = await dbCloud.collection('bills').doc(this.data.billId).get();
      const bill = billRes.data;
      
      // 检查权限
      const userName = db.getCurrentUser();
      const isCreator = bill.creator === userName;
      
      // 如果不是创建者，设置为只读模式
      if (!isCreator && !this.data.isReadOnly) {
        this.setData({ isReadOnly: true });
        wx.setNavigationBarTitle({
          title: '账单详情'
        });
      }
      
      // 格式化时间
      const billTime = bill.time ? (bill.time.getTime ? bill.time : new Date(bill.time)) : new Date();
      const year = billTime.getFullYear();
      const month = String(billTime.getMonth() + 1).padStart(2, '0');
      const day = String(billTime.getDate()).padStart(2, '0');
      const hours = String(billTime.getHours()).padStart(2, '0');
      const minutes = String(billTime.getMinutes()).padStart(2, '0');
      
      // 加载参与成员
      const groupRes = await dbCloud.collection('groups')
        .where({ activityId: this.data.activityId })
        .limit(1)
        .get();
      
      let members = [];
      if (groupRes.data && groupRes.data.length > 0) {
        members = groupRes.data[0].members || [];
      }
      
      // 生成参与成员列表，使用账单中的权重
      const participants = members.map(m => {
        const name = typeof m === 'string' ? m : m.name;
        const weight = bill.participants && bill.participants[name] !== undefined 
          ? Number(bill.participants[name]) || 0 
          : 0;
        return { name, weight };
      });
      
      // 加载活动信息，检查是否是打平伙活动
      const actRes = await dbCloud.collection('activities').doc(this.data.activityId).get();
      const activity = actRes.data;
      const isPrepaid = activity ? (activity.isPrepaid || false) : false;
      const keeper = activity ? (activity.keeper || '') : '';
      
      // 设置付款人索引
      let payerIndex = 0;
      let payerDisabled = false;
      
      // 如果是打平伙活动，付款人固定为保管人员
      if (isPrepaid && keeper) {
        const keeperIndex = this.data.payerList.findIndex(p => p.name === keeper);
        if (keeperIndex >= 0) {
          payerIndex = keeperIndex;
          payerDisabled = true;
        }
      } else {
        // 如果不是打平伙活动，使用账单中的付款人
        payerIndex = this.data.payerList.findIndex(p => p.name === bill.payer);
        if (payerIndex < 0) {
          payerIndex = 0;
        }
      }
      
      this.setData({
        amount: String(bill.amount || ''),
        title: bill.title || '',
        date: `${year}-${month}-${day}`,
        time: `${hours}:${minutes}`,
        payerIndex: payerIndex,
        participants: participants,
        remark: bill.remark || '',
        isPrepaid: isPrepaid,
        keeper: keeper,
        payerDisabled: payerDisabled,
      });
      
    } catch (e) {
      console.error('加载账单数据失败:', e);
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
    }
    
    wx.hideLoading();
  },
  
  onAmountInput(e) {
    this.setData({ amount: e.detail.value });
  },
  
  onTitleInput(e) {
    const title = e.detail.value;
    if (title.length > 7) {
      wx.showModal({
        title: '提示',
        content: '账单名称不能超过7个汉字，请修改后重试。',
        showCancel: false,
        confirmText: '确定',
        success: () => {
          // 焦点会自动回到输入框
        }
      });
      return;
    }
    this.setData({ title });
  },
  
  onDateChange(e) {
    this.setData({ date: e.detail.value });
  },
  
  onTimeChange(e) {
    this.setData({ time: e.detail.value });
  },
  
  onPayerChange(e) {
    // 如果是打平伙活动，不允许更改付款人
    if (this.data.payerDisabled) {
      return;
    }
    this.setData({ payerIndex: e.detail.value });
  },
  
  onWeightChange(e) {
    const name = e.currentTarget.dataset.name;
    const weight = Number(e.detail.value);
    
    const participants = this.data.participants.map(p => {
      if (p.name === name) {
        return { ...p, weight: weight };
      }
      return p;
    });
    
    this.setData({ participants });
  },
  
  onRemarkInput(e) {
    this.setData({ remark: e.detail.value });
  },
  
  async saveBill() {
    // 验证账单名称长度
    if (this.data.title.length > 7) {
      wx.showModal({
        title: '提示',
        content: '账单名称不能超过7个汉字，请修改后重试。',
        showCancel: false,
        confirmText: '确定',
      });
      return;
    }
    
    const amount = Number(this.data.amount);
    if (!amount || amount <= 0) {
      wx.showToast({
        title: '金额必须大于0',
        icon: 'none'
      });
      return;
    }
    
    const title = this.data.title.trim() || '未命名';
    const payer = this.data.payerList[this.data.payerIndex].name;
    const remark = this.data.remark.trim();
    
    // 收集参与成员权重（与Web版本保持一致）
    // 确保所有成员都保存（包括权重为0的），以便编辑时能正确显示
    // 只保存当前活动成员，清除已不存在的旧成员
    const participants = {};
    this.data.participants.forEach(p => {
      // 确保权重值是数字类型，避免类型不一致的问题
      const weight = typeof p.weight === 'number' ? p.weight : Number(p.weight || 0);
      participants[p.name] = weight;
    });
    
    // 确保只保存当前活动成员，清除数据库中已不存在的旧成员
    // 获取当前活动成员列表
    const currentMemberNames = this.data.participants.map(p => p.name);
    console.log('当前活动成员:', currentMemberNames);
    console.log('准备保存的participants:', participants);
    
    // 检查付款人的权重是否大于0
    const payerWeight = participants[payer] || 0;
    if (payerWeight <= 0) {
      wx.showModal({
        title: '提示',
        content: '付款人的权重必须大于0，请修改后重试。',
        showCancel: false,
        confirmText: '确定',
        success: () => {
          // 对话框关闭后，焦点会自动回到页面
        }
      });
      return;
    }
    
    // 检查是否有权重大于0的成员
    const namesWithWeight = Object.keys(participants).filter(name => participants[name] > 0);
    if (namesWithWeight.length === 0) {
      wx.showToast({
        title: '至少添加一个参与成员（权重大于0）',
        icon: 'none'
      });
      return;
    }
    
    // 计算分摊金额（与Web版本保持一致）
    // 为所有成员设置 splitDetail，权重为0的成员金额为0
    const totalWeight = namesWithWeight.reduce((sum, name) => sum + participants[name], 0);
    const splitDetail = {};
    Object.keys(participants).forEach(name => {
      if (participants[name] > 0 && totalWeight > 0) {
        // 权重大于0的成员：按权重比例计算
        const share = amount * participants[name] / totalWeight;
        splitDetail[name] = Number(share.toFixed(2));
      } else {
        // 权重为0的成员：金额为0
        splitDetail[name] = 0;
      }
    });
    
    // 组合时间（使用iOS兼容格式）
    const dateStr = this.data.date; // 格式：yyyy-MM-dd
    const timeStr = this.data.time; // 格式：HH:mm
    // 转换为 iOS 兼容格式：yyyy-MM-ddTHH:mm:ss
    const time = new Date(`${dateStr}T${timeStr}:00`);
    
    wx.showLoading({
      title: this.data.isEdit ? '更新中...' : '保存中...'
    });
    
    try {
      const dbCloud = wx.cloud.database();
      const userName = db.getCurrentUser();
      
      // 确保只包含当前活动成员，不包含任何旧成员
      // 获取当前活动成员名称列表
      const currentMemberNames = this.data.participants.map(p => p.name);
      
      // 清理participants，只保留当前活动成员
      const cleanParticipants = {};
      currentMemberNames.forEach(name => {
        if (participants.hasOwnProperty(name)) {
          cleanParticipants[name] = participants[name];
        }
      });
      
      // 清理splitDetail，只保留当前活动成员
      const cleanSplitDetail = {};
      currentMemberNames.forEach(name => {
        if (splitDetail.hasOwnProperty(name)) {
          cleanSplitDetail[name] = splitDetail[name];
        }
      });
      
      console.log('清理后的participants:', cleanParticipants);
      console.log('清理后的splitDetail:', cleanSplitDetail);
      console.log('当前活动成员:', currentMemberNames);
      
      const billData = {
        activityId: this.data.activityId,
        amount,
        title,
        payer,
        participants: cleanParticipants, // 使用清理后的participants
        splitDetail: cleanSplitDetail, // 使用清理后的splitDetail
        time: time,
        remark,
      };
      
      if (this.data.isEdit) {
        // 更新账单
        // 更新时，必须明确设置所有字段，确保完全覆盖旧数据
        // 特别是participants和splitDetail，必须根据新的权重重新计算
        console.log('更新账单，billData.participants:', billData.participants);
        console.log('更新账单，billData.splitDetail:', billData.splitDetail);
        console.log('当前活动成员列表:', currentMemberNames);
        
        // 先读取当前账单，获取系统字段（_id, _openid, creator, createdAt等）
        const currentBillDoc = await dbCloud.collection('bills').doc(this.data.billId).get();
        const currentBill = currentBillDoc.data;
        const oldParticipants = currentBill.participants || {};
        const oldParticipantNames = Object.keys(oldParticipants);
        
        // 找出需要删除的旧成员（不在当前活动成员列表中的）
        const oldMembersToRemove = oldParticipantNames.filter(name => !currentMemberNames.includes(name));
        if (oldMembersToRemove.length > 0) {
          console.log('发现需要删除的旧成员:', oldMembersToRemove);
          console.log('旧participants:', oldParticipants);
        }
        
        // 使用 set 方法完全替换文档，确保清除所有旧成员数据
        // 构建完全干净的数据对象，只包含当前活动成员
        const cleanBillData = {
          activityId: billData.activityId,
          amount: billData.amount,
          title: billData.title,
          payer: billData.payer,
          participants: billData.participants, // 只包含当前活动成员，完全替换旧对象
          splitDetail: billData.splitDetail,   // 只包含当前活动成员，完全替换旧对象
          time: billData.time,
          remark: billData.remark,
          creator: currentBill.creator || userName, // 保留创建者
          createdAt: currentBill.createdAt || new Date(), // 保留创建时间
          updatedAt: new Date(),
        };
        
        // 使用 set 方法完全替换文档，确保清除所有旧字段（包括旧成员的participants和splitDetail）
        await dbCloud.collection('bills').doc(this.data.billId).set({
          data: cleanBillData
        });
        
        // 验证更新后的数据
        const updatedBill = await dbCloud.collection('bills').doc(this.data.billId).get();
        const updatedParticipants = updatedBill.data.participants || {};
        const updatedSplitDetail = updatedBill.data.splitDetail || {};
        console.log('更新后的账单数据:', updatedBill.data);
        console.log('更新后的participants:', updatedParticipants);
        console.log('更新后的splitDetail:', updatedSplitDetail);
        console.log('更新后的participants keys:', Object.keys(updatedParticipants));
        console.log('更新后的splitDetail keys:', Object.keys(updatedSplitDetail));
        
        // 验证是否还有旧成员
        const remainingOldMembers = Object.keys(updatedParticipants).filter(name => !currentMemberNames.includes(name));
        if (remainingOldMembers.length > 0) {
          console.error('错误：更新后仍有旧成员:', remainingOldMembers);
        } else {
          console.log('✓ 更新成功，已清除所有旧成员');
        }
        
        // 验证splitDetail是否包含所有成员
        const missingInSplitDetail = currentMemberNames.filter(name => !updatedSplitDetail.hasOwnProperty(name));
        if (missingInSplitDetail.length > 0) {
          console.error('错误：splitDetail中缺少成员:', missingInSplitDetail);
        } else {
          console.log('✓ splitDetail包含所有成员');
        }
        
        wx.hideLoading();
        wx.showToast({
          title: '更新成功',
          icon: 'success'
        });
      } else {
        // 创建账单
        await dbCloud.collection('bills').add({
          data: {
            ...billData,
            creator: userName,
            createdAt: new Date(),
          }
        });
        
        wx.hideLoading();
        wx.showToast({
          title: '保存成功',
          icon: 'success'
        });
      }
      
      // 返回上一页
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
    } catch (e) {
      wx.hideLoading();
      console.error('保存账单失败:', e);
      wx.showToast({
        title: '保存失败',
        icon: 'none'
      });
    }
  },
});

