// pages/activity/detail.js
const db = require('../../utils/db.js');
const app = getApp();

Page({
  data: {
    activityId: '',
    activity: null,
    activityMeta: '',
    currentTab: 'bills',
    bills: [],
    members: [],
    total: 0,
    avg: 0,
    dateRange: '',
    suggestionMember: null,
    isCreator: false, // 是否是活动创建者
  },
  
  onLoad(options) {
    if (options.id) {
      this.setData({ activityId: options.id });
      this.loadActivityData();
    }
  },
  
  onShow() {
    // 每次显示页面时刷新数据
    if (this.data.activityId) {
      this.loadActivityData();
    }
  },
  
  async loadActivityData() {
    wx.showLoading({ title: '加载中...' });
    
    try {
      const dbCloud = wx.cloud.database();
      const activityId = this.data.activityId;
      
      // 加载活动信息
      const actRes = await dbCloud.collection('activities').doc(activityId).get();
      const activity = actRes.data;
      
      // 加载活动的group（获取最新成员列表）
      const groupRes = await dbCloud.collection('groups')
        .where({ activityId: activityId })
        .limit(1)
        .get();
      
      if (groupRes.data && groupRes.data.length > 0) {
        activity.members = groupRes.data[0].members;
      }
      
      const activityMeta = (activity.type || '') + ' | 成员：' + (activity.members || []).map(m => m.name).join('、');
      
      // 加载账单列表
      const billsRes = await dbCloud.collection('bills')
        .where({ activityId: activityId })
        .get();
      
      let bills = billsRes.data || [];
      
      // 按日期排序（从最近到最远）
      bills = bills.sort((a, b) => {
        const getDate = (bill) => {
          if (bill.time) {
            return bill.time.getTime ? bill.time.getTime() : new Date(bill.time).getTime();
          }
          if (bill.createdAt) {
            return bill.createdAt.getTime ? bill.createdAt.getTime() : new Date(bill.createdAt).getTime();
          }
          return 0;
        };
        return getDate(b) - getDate(a);
      });
      
      // 处理账单数据，生成圆圈和显示信息
      const userName = db.getCurrentUser();
      const isActivityCreator = activity.creator === userName;
      
      const processedBills = bills.map(bill => {
        const circles = this.generateCircles(bill);
        const totalCount = this.calculateTotalCount(bill);
        const date = this.formatBillDate(bill);
        const isBillCreator = bill.creator === userName;
        // 金额格式化为2位小数
        const amount = Number(bill.amount || 0).toFixed(2);
        
        console.log(`账单 ${bill.title} - participants:`, bill.participants);
        console.log(`账单 ${bill.title} - totalCount:`, totalCount);
        
        return {
          ...bill,
          circles,
          totalCount,
          date,
          isCreator: isBillCreator,
          amount, // 格式化的金额字符串
        };
      });
      
      // 计算余额
      const balances = this.calcBalances(activity.members || [], bills);
      
      // 计算总支出和人均
      const total = bills.reduce((sum, b) => sum + (Number(b.amount) || 0), 0);
      const totalWeight = (activity.members || []).reduce((sum, m) => sum + (Number(m.weight) || 2), 0) || 1;
      const avg = total / totalWeight;
      
      // 计算日期范围
      const dateRange = this.calculateDateRange(bills);
      
      // 生成成员列表（带余额），所有金额精确到小数点后2位（格式化为字符串以便显示）
      const members = (activity.members || []).map(m => {
        const bal = balances[m.name] || { paid: 0, shouldPay: 0, balance: 0 };
        return {
          name: m.name,
          bal: {
            paid: bal.paid.toFixed(2),
            shouldPay: bal.shouldPay.toFixed(2),
            balance: bal.balance.toFixed(2)
          }
        };
      });
      
      // 建议下一次买单人员（余额最小的成员）
      const suggestionMember = this.getSuggestionMember(balances);
      
      this.setData({
        activity,
        activityMeta,
        bills: processedBills,
        members,
        total: total.toFixed(2),
        avg: avg.toFixed(2),
        dateRange,
        suggestionMember,
        isCreator: isActivityCreator, // 保存是否是活动创建者
      });
      
      // 保存到全局数据
      app.globalData.currentActivity = activity;
      app.globalData.currentActivityBills = bills;
      app.globalData.currentActivityBalances = balances;
      
    } catch (e) {
      console.error('加载活动数据失败:', e);
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
    }
    
    wx.hideLoading();
  },
  
  // 生成圆圈数据
  generateCircles(bill) {
    const circles = [];
    if (!bill.participants) {
      // 没有参与成员，显示3个虚线圆
      for (let i = 0; i < 3; i++) {
        circles.push({
          type: 'dashed',
          marginLeft: i === 0 ? '0' : '-7px',
        });
      }
      return circles;
    }
    
    // 获取所有权重大于0的成员名称
    const membersWithWeight = Object.keys(bill.participants).filter(name => {
      const weight = bill.participants[name] || 0;
      return weight > 0;
    });
    
    const maxDisplay = 3;
    
    // 如果超过3个人，确保付款人必须显示，其他随机选择
    if (membersWithWeight.length > maxDisplay) {
      const payer = bill.payer;
      let displayMembers = [];
      
      // 如果付款人权重大于0，确保付款人在列表中
      if (payer && membersWithWeight.includes(payer)) {
        displayMembers.push(payer);
        // 从剩余成员中随机选择2个
        const remainingMembers = membersWithWeight.filter(name => name !== payer);
        // 随机打乱并取前2个
        const shuffled = remainingMembers.sort(() => Math.random() - 0.5);
        displayMembers = displayMembers.concat(shuffled.slice(0, 2));
      } else {
        // 如果付款人不在权重大于0的列表中，随机选择3个
        const shuffled = membersWithWeight.sort(() => Math.random() - 0.5);
        displayMembers = shuffled.slice(0, maxDisplay);
      }
      
      // 生成圆圈（按姓氏显示）
      for (let i = 0; i < maxDisplay; i++) {
        if (i < displayMembers.length) {
          const memberName = displayMembers[i];
          const surname = memberName.charAt(0);
          const isPayer = memberName === payer;
          const color = isPayer ? '#007bff' : '#D4A574';
          
          circles.push({
            type: 'solid',
            surname: surname,
            color: color,
            marginLeft: i === 0 ? '0' : '-7px',
          });
        } else {
          // 虚线圆
          circles.push({
            type: 'dashed',
            marginLeft: i === 0 ? '0' : '-7px',
          });
        }
      }
    } else {
      // 如果不超过3个人，按原来的逻辑（按姓氏分组显示）
      // 按姓氏分组统计
      const surnameMap = {};
      Object.keys(bill.participants).forEach(name => {
        const weight = bill.participants[name] || 0;
        if (weight > 0) {
          const surname = name.charAt(0);
          if (!surnameMap[surname]) {
            surnameMap[surname] = 0;
          }
          surnameMap[surname] += weight;
        }
      });
      
      const surnames = Object.keys(surnameMap);
      const displayedSurnames = surnames.slice(0, maxDisplay);
      
      // 生成圆圈
      for (let i = 0; i < maxDisplay; i++) {
        if (i < displayedSurnames.length) {
          const surname = displayedSurnames[i];
          const hasPayer = Object.keys(bill.participants).some(name => 
            name.charAt(0) === surname && bill.participants[name] > 0 && bill.payer === name
          );
          const color = hasPayer ? '#007bff' : '#D4A574';
          
          circles.push({
            type: 'solid',
            surname: surname,
            color: color,
            marginLeft: i === 0 ? '0' : '-7px',
          });
        } else {
          // 虚线圆
          circles.push({
            type: 'dashed',
            marginLeft: i === 0 ? '0' : '-7px',
          });
        }
      }
    }
    
    return circles;
  },
  
  // 计算总权重
  calculateTotalCount(bill) {
    if (!bill.participants) return 0;
    let total = 0;
    Object.keys(bill.participants).forEach(name => {
      const weight = bill.participants[name] || 0;
      if (weight > 0) {
        total += weight;
      }
    });
    return total;
  },
  
  // 格式化账单日期
  formatBillDate(bill) {
    const date = bill.time ? (bill.time.getTime ? bill.time : new Date(bill.time)) : 
                 (bill.createdAt ? (bill.createdAt.getTime ? bill.createdAt : new Date(bill.createdAt)) : new Date());
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}.${month}.${day}`;
  },
  
  // 计算余额
  calcBalances(members, bills) {
    const map = {};
    members.forEach(m => {
      map[m.name] = { paid: 0, shouldPay: 0, balance: 0 };
    });
    
    // 统计实付与应付
    bills.forEach(b => {
      const amount = Number(b.amount || 0);
      if (b.payer && map[b.payer]) {
        map[b.payer].paid += amount;
      }
      if (b.splitDetail) {
        Object.keys(b.splitDetail).forEach(name => {
          if (!map[name]) return;
          if (b.participants && b.participants[name] > 0) {
            map[name].shouldPay += Number(b.splitDetail[name] || 0);
          }
        });
      }
    });
    
    // 余额：实付 - 应付
    Object.keys(map).forEach(name => {
      const v = map[name];
      v.balance = v.paid - v.shouldPay;
    });
    
    return map;
  },
  
  // 计算日期范围
  calculateDateRange(bills) {
    if (bills.length === 0) return '至今';
    
    let earliestDate = null;
    bills.forEach(b => {
      const billDate = b.time ? (b.time.getTime ? b.time : new Date(b.time)) : 
                      (b.createdAt ? (b.createdAt.getTime ? b.createdAt : new Date(b.createdAt)) : null);
      if (billDate) {
        if (!earliestDate || billDate < earliestDate) {
          earliestDate = billDate;
        }
      }
    });
    
    if (!earliestDate) return '至今';
    
    const formatDate = (d) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
    
    const today = new Date();
    return `${formatDate(earliestDate)} 至 ${formatDate(today)}`;
  },
  
  // 获取建议买单人员（余额最小的成员）
  getSuggestionMember(balances) {
    let minBalanceMember = null;
    let minBalance = Infinity;
    
    Object.keys(balances).forEach(name => {
      const bal = balances[name];
      if (bal.balance < minBalance) {
        minBalance = bal.balance;
        minBalanceMember = {
          name: name,
          shouldPay: bal.shouldPay.toFixed(2),
          paid: bal.paid.toFixed(2),
        };
      }
    });
    
    return minBalanceMember;
  },
  
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ currentTab: tab });
  },
  
  addBill() {
    wx.navigateTo({
      url: `/pages/bill/edit?activityId=${this.data.activityId}`
    });
  },
  
  viewBill(e) {
    const bill = e.currentTarget.dataset.bill;
    const userName = db.getCurrentUser();
    const isCreator = bill.creator === userName;
    
    // 创建者可以编辑，其他人只能查看（只读模式）
    wx.navigateTo({
      url: `/pages/bill/edit?activityId=${this.data.activityId}&billId=${bill._id}&readOnly=${!isCreator}`
    });
  },
  
  deleteBill(e) {
    const billId = e.currentTarget.dataset.id;
    const billTitle = e.currentTarget.dataset.title;
    
    wx.showModal({
      title: '确认删除',
      content: `确定要删除账单"${billTitle}"吗？此操作不可恢复！`,
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '删除中...' });
          try {
            const result = await db.deleteBill(billId);
            if (result.success) {
              wx.hideLoading();
              wx.showToast({
                title: '删除成功',
                icon: 'success'
              });
              this.loadActivityData();
            } else {
              throw new Error(result.error);
            }
          } catch (e) {
            wx.hideLoading();
            wx.showToast({
              title: '删除失败',
              icon: 'none'
            });
          }
        }
      }
    });
  },
  
  editActivity() {
    // 只有创建者才能编辑活动
    if (!this.data.isCreator) {
      wx.showToast({
        title: '只有创建者可以编辑活动',
        icon: 'none'
      });
      return;
    }
    
    // 准备活动数据
    const activityData = {
      ...this.data.activity,
      memberNames: this.data.activity.members ? this.data.activity.members.map(m => typeof m === 'string' ? m : m.name) : []
    };
    
    wx.navigateTo({
      url: `/pages/activity/create?id=${this.data.activityId}&data=${encodeURIComponent(JSON.stringify(activityData))}`
    });
  },
});


