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
    isPrepaid: false, // 是否打平伙
    keeper: '', // 保管人员
    recharges: [], // 充值列表
    totalRecharge: 0, // 充值总金额
    totalConsume: 0, // 消费总金额
    remaining: 0, // 剩余金额
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
      
      // 调试：打印isPrepaid值
      console.log('活动 isPrepaid 值:', activity.isPrepaid, typeof activity.isPrepaid);
      
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
      // 如果是打平伙活动，需要传入充值数据
      let balances = {};
      if (activity.isPrepaid) {
        // 先加载充值数据
        try {
          const dbCloud = wx.cloud.database();
          let rechargesRes;
          try {
            rechargesRes = await dbCloud.collection('recharges')
              .where({ activityId: activityId })
              .orderBy('date', 'desc')
              .get();
          } catch (e) {
            try {
              rechargesRes = await dbCloud.collection('recharges')
                .where({ activityId: activityId })
                .orderBy('createdAt', 'desc')
                .get();
            } catch (e2) {
              // 如果createdAt也没有索引，尝试不使用排序
              console.log('结算计算 - 尝试不使用排序:', e2);
              try {
                rechargesRes = await dbCloud.collection('recharges')
                  .where({ activityId: activityId })
                  .get();
              } catch (e3) {
                console.error('结算计算 - 加载充值记录失败（可能是权限问题）:', e3);
                rechargesRes = { data: [] };
              }
            }
          }
          const recharges = rechargesRes.data || [];
          console.log('结算计算使用的充值记录数量:', recharges.length);
          console.log('结算计算使用的充值记录:', recharges.map(r => ({ payer: r.payer, amount: r.amount })));
          balances = this.calcBalances(activity.members || [], bills, recharges);
        } catch (e) {
          console.error('加载充值数据失败:', e);
          balances = this.calcBalances(activity.members || [], bills, []);
        }
      } else {
        balances = this.calcBalances(activity.members || [], bills, []);
      }
      
      // 计算总支出和人均
      const total = bills.reduce((sum, b) => sum + (Number(b.amount) || 0), 0);
      
      // 计算总权重：基于所有账单的participants权重之和
      // 如果账单有participants，使用账单的权重；否则使用活动成员的默认权重
      let totalWeight = 0;
      if (bills.length > 0) {
        // 使用最近一次账单的participants权重来计算人均
        // 找到最近一次账单（按时间排序，取第一个）
        const latestBill = bills[0]; // bills已经按时间倒序排序
        if (latestBill.participants) {
          // 计算最近一次账单的participants权重之和
          Object.keys(latestBill.participants).forEach(name => {
            const weight = Number(latestBill.participants[name]) || 0;
            if (weight > 0) {
              totalWeight += weight;
            }
          });
        }
      }
      
      // 如果没有账单或账单没有participants，使用活动成员的默认权重
      if (totalWeight === 0) {
        totalWeight = (activity.members || []).reduce((sum, m) => sum + (Number(m.weight) || 2), 0) || 1;
      }
      
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
      
      // 如果是打平伙活动，加载充值数据
      let recharges = [];
      let totalRecharge = 0;
      let totalConsume = total;
      let remaining = 0;
      
      if (activity.isPrepaid) {
        try {
          const dbCloud = wx.cloud.database();
          console.log('🔍 开始查询充值记录，activityId:', activityId);
          
          let rechargesRes;
          let queryError = null;
          
          try {
            // 尝试使用date字段排序
            console.log('📅 尝试使用date字段排序查询...');
            rechargesRes = await dbCloud.collection('recharges')
              .where({ activityId: activityId })
              .orderBy('date', 'desc')
              .get();
            console.log('✅ 查询成功，返回数据:', rechargesRes);
          } catch (e) {
            queryError = e;
            console.log('⚠️ date字段排序失败，错误:', e);
            console.log('错误码:', e.errCode, '错误信息:', e.errMsg);
            
            // 如果date字段没有索引，使用createdAt排序
            try {
              console.log('📅 尝试使用createdAt排序查询...');
              rechargesRes = await dbCloud.collection('recharges')
                .where({ activityId: activityId })
                .orderBy('createdAt', 'desc')
                .get();
              console.log('✅ 查询成功，返回数据:', rechargesRes);
            } catch (e2) {
              queryError = e2;
              console.log('⚠️ createdAt排序也失败，错误:', e2);
              console.log('错误码:', e2.errCode, '错误信息:', e2.errMsg);
              
              // 如果createdAt也没有索引，尝试不使用排序
              try {
                console.log('📅 尝试不使用排序查询...');
                rechargesRes = await dbCloud.collection('recharges')
                  .where({ activityId: activityId })
                  .get();
                console.log('✅ 查询成功，返回数据:', rechargesRes);
              } catch (e3) {
                queryError = e3;
                console.error('❌ 所有查询方式都失败:', e3);
                console.error('错误码:', e3.errCode, '错误信息:', e3.errMsg);
                wx.showToast({
                  title: '加载充值记录失败，请检查数据库权限',
                  icon: 'none',
                  duration: 3000
                });
                rechargesRes = { data: [] };
              }
            }
          }
          
          recharges = rechargesRes.data || [];
          
          console.log('📊 查询结果统计:');
          console.log('  - 加载的充值记录数量:', recharges.length);
          console.log('  - 返回的原始数据:', rechargesRes);
          console.log('  - 充值记录详情:', recharges.map(r => ({ 
            _id: r._id, 
            payer: r.payer, 
            amount: r.amount, 
            creator: r.creator, 
            recorder: r.recorder,
            activityId: r.activityId
          })));
          
          // 如果充值记录数量为0，但活动是打平伙，可能是权限问题
          if (recharges.length === 0 && activity.isPrepaid) {
            console.warn('⚠️ 警告：打平伙活动但没有充值记录！');
            console.warn('可能的原因：');
            console.warn('  1. 数据库权限问题 - recharges集合可能设置为"仅创建者可读"');
            console.warn('  2. 确实没有充值记录');
            console.warn('  3. activityId不匹配');
            console.warn('当前查询的activityId:', activityId);
            
            // 尝试查询所有充值记录（不限制activityId）来测试权限
            try {
              console.log('🔍 测试：尝试查询所有充值记录（测试权限）...');
              const testRes = await dbCloud.collection('recharges').limit(1).get();
              console.log('✅ 权限测试结果 - 可以查询，返回:', testRes.data?.length || 0, '条记录');
            } catch (testErr) {
              console.error('❌ 权限测试失败:', testErr);
              console.error('这确认了是数据库权限问题！');
            }
          }
          
          // 如果没有排序，手动按日期倒序排序
          if (recharges.length > 0) {
            recharges.sort((a, b) => {
              const dateA = a.date ? (a.date.getTime ? a.date.getTime() : new Date(a.date).getTime()) : 
                           (a.createdAt ? (a.createdAt.getTime ? a.createdAt.getTime() : new Date(a.createdAt).getTime()) : 0);
              const dateB = b.date ? (b.date.getTime ? b.date.getTime() : new Date(b.date).getTime()) : 
                           (b.createdAt ? (b.createdAt.getTime ? b.createdAt.getTime() : new Date(b.createdAt).getTime()) : 0);
              return dateB - dateA; // 倒序
            });
          }
          
          // 计算充值总金额（所有充值记录的总和）
          totalRecharge = recharges.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
          console.log('充值总金额:', totalRecharge);
          
          // 计算剩余金额
          remaining = totalRecharge - totalConsume;
        } catch (e) {
          console.error('加载充值数据失败:', e);
          console.error('错误详情:', {
            message: e.message,
            errCode: e.errCode,
            errMsg: e.errMsg
          });
          
          // 如果是权限错误，提示用户
          if (e.errCode === -601034 || e.errMsg && e.errMsg.includes('权限')) {
            wx.showToast({
              title: '数据库权限不足，请检查recharges集合权限设置',
              icon: 'none',
              duration: 3000
            });
          }
        }
      }
      
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
        isPrepaid: activity.isPrepaid || false,
        keeper: activity.keeper || '', // 保管人员
        recharges: recharges.map(r => ({
          ...r,
          date: this.formatRechargeDate(r),
          amount: Number(r.amount || 0).toFixed(2),
          recorder: r.recorder || r.creator, // 记录人，如果没有recorder字段则使用creator
          isCreator: r.creator === db.getCurrentUser(),
        })),
        totalRecharge: totalRecharge.toFixed(2),
        totalConsume: totalConsume.toFixed(2),
        remaining: remaining.toFixed(2),
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
  
  // 格式化充值日期
  formatRechargeDate(recharge) {
    const date = recharge.date ? (recharge.date.getTime ? recharge.date : new Date(recharge.date)) :
                 (recharge.createdAt ? (recharge.createdAt.getTime ? recharge.createdAt : new Date(recharge.createdAt)) : new Date());
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}.${month}.${day}`;
  },
  
  // 计算余额
  calcBalances(members, bills, recharges = []) {
    const map = {};
    members.forEach(m => {
      map[m.name] = { paid: 0, shouldPay: 0, balance: 0 };
    });
    
    // 如果是打平伙活动，实付为充值金额（所有充值记录的总和）
    if (recharges.length > 0) {
      console.log('计算实付 - 充值记录数量:', recharges.length);
      recharges.forEach(r => {
        const amount = Number(r.amount || 0);
        const payer = r.payer;
        console.log(`充值记录 - 付款人: ${payer}, 金额: ${amount}`);
        if (payer && map[payer]) {
          map[payer].paid += amount;
          console.log(`更新 ${payer} 的实付: ${map[payer].paid}`);
        }
      });
    } else {
      // 非打平伙活动，实付为账单付款金额
      bills.forEach(b => {
        const amount = Number(b.amount || 0);
        if (b.payer && map[b.payer]) {
          map[b.payer].paid += amount;
        }
      });
    }
    
    // 统计应付（所有活动都按账单分摊计算）
    bills.forEach(b => {
      if (b.splitDetail) {
        Object.keys(b.splitDetail).forEach(name => {
          if (!map[name]) return;
          // 只有权重大于0的成员才计算应付
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
  
  // 添加充值
  addRecharge() {
    wx.navigateTo({
      url: `/pages/recharge/add?activityId=${this.data.activityId}`
    });
  },
  
  // 删除充值
  deleteRecharge(e) {
    const rechargeId = e.currentTarget.dataset.id;
    const payer = e.currentTarget.dataset.payer;
    const amount = e.currentTarget.dataset.amount;
    
    wx.showModal({
      title: '确认删除',
      content: `确定要删除充值记录（${payer}，¥${amount}）吗？此操作不可恢复！`,
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '删除中...' });
          try {
            const dbCloud = wx.cloud.database();
            await dbCloud.collection('recharges').doc(rechargeId).remove();
            wx.hideLoading();
            wx.showToast({
              title: '删除成功',
              icon: 'success'
            });
            this.loadActivityData();
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
});


