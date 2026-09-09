// 人员与校招历史风险情报。
// 仅保存可追溯公开证据；不做公司打分，不把匿名单帖当事实。
// evidenceLevel: A=公司/监管/法院等一手材料；B=Reuters 等高可信媒体或公司回应经媒体确认；
// C=可追溯社区经验/汇总，仅作求职线索；D=未经核实传闻（默认不展示）。
export const companyRiskHistory = [
  {
    company: '腾讯',
    aliases: ['腾讯控股', 'Tencent'],
    events: [
      {
        id: 'tencent-layoff-2022-11',
        type: 'layoff',
        sentiment: 'negative',
        date: '2022-11-15',
        scope: 'PCG / IEG / CSIG',
        title: 'Reuters 报道视频、游戏和云业务出现新一轮裁员',
        summary: 'Reuters 引述多名知情人士称，腾讯在平台与内容、互动娱乐、云与智慧产业等业务开启新一轮人员调整；报道同时指出腾讯此前已经进行过人员缩减。',
        evidenceLevel: 'B',
        source: 'Reuters（经 Investing.com 转载）',
        sourceUrl: 'https://www.investing.com/news/stock-market-news/chinas-tencent-starts-new-round-of-layoffs-sources-2944313'
      },
      {
        id: 'tencent-intern-conversion-2024',
        type: 'intern_conversion',
        sentiment: 'mixed',
        date: '2024-08-01',
        scope: '暑期实习留用',
        title: '社区反馈显示留用受 BG/HC 与评审影响较大',
        summary: '2024 年牛客多条实习讨论显示，腾讯实习留用存在 BG、HC 和额外评审差异。该类信息属于社区经验，不能外推为全公司固定转正率。',
        evidenceLevel: 'C',
        source: '牛客社区',
        sourceUrl: 'https://www.nowcoder.com/feed/main/detail/933c7773dbe44ae0bc0cae314af17736'
      }
    ]
  },
  {
    company: '小米',
    aliases: ['小米集团', 'Xiaomi'],
    events: [
      {
        id: 'xiaomi-layoff-2022-12',
        type: 'layoff',
        sentiment: 'negative',
        date: '2022-12-20',
        scope: '智能手机与互联网服务等业务',
        title: '公司确认人员优化影响低于总员工数 10%',
        summary: 'Reuters 报道，小米发言人确认当时进行人员优化与组织精简，并表示受影响人数低于总员工数的 10%。',
        evidenceLevel: 'B',
        source: 'Reuters（经 Yahoo 转载）',
        sourceUrl: 'https://tech.yahoo.com/general/articles/china-smartphone-maker-xiaomi-slash-020255022.html'
      }
    ]
  },
  {
    company: '阿里巴巴',
    aliases: ['阿里', 'Alibaba', '阿里云'],
    events: [
      {
        id: 'alibaba-cloud-layoff-2023-05',
        type: 'layoff',
        sentiment: 'negative',
        date: '2023-05-23',
        scope: '阿里云',
        title: 'Reuters 报道阿里云重组期间约 7% 人员缩减',
        summary: 'Reuters 引述知情人士称，阿里云在业务重组期间启动人员缩减，影响约 7% 员工。该事件针对云业务，不应直接外推到阿里所有 BU。',
        evidenceLevel: 'B',
        source: 'Reuters（经 Investing.com 转载）',
        sourceUrl: 'https://www.investing.com/news/stock-market-news/alibabas-cloud-unit-to-cut-7-of-staff--bloomberg-news-3088588'
      },
      {
        id: 'alibaba-intern-conversion-2024',
        type: 'intern_conversion',
        sentiment: 'mixed',
        date: '2024-07-16',
        scope: '暑期实习留用',
        title: '社区汇总称不同 BU 的留用率差异明显',
        summary: '牛客社区 2024 年经验汇总称，多数团队暑期实习留用相对友好，但部分业务存在 HC、批次与团队差异；属于社区线索，不能视为官方转正率。',
        evidenceLevel: 'C',
        source: '牛客社区经验汇总',
        sourceUrl: 'https://www.nowcoder.com/feed/main/detail/2d816894b89b44beb5c2553948960e12'
      }
    ]
  },
  {
    company: '字节跳动',
    aliases: ['ByteDance', 'TikTok'],
    events: [
      {
        id: 'bytedance-indonesia-layoff-2024-06',
        type: 'layoff',
        sentiment: 'negative',
        date: '2024-06-14',
        scope: '印尼 TikTok / Tokopedia 整合',
        title: 'ByteDance 确认印尼业务整合后裁员',
        summary: 'Reuters 报道，ByteDance 在 TikTok 与 Tokopedia 业务整合后确认印尼团队将进行人员调整；公司未披露最终人数。',
        evidenceLevel: 'B',
        source: 'Reuters',
        sourceUrl: 'https://www.reuters.com/technology/bytedance-confirms-layoff-plan-its-indonesian-unit-2024-06-14/'
      },
      {
        id: 'bytedance-moderation-layoff-2024-10',
        type: 'layoff',
        sentiment: 'negative',
        date: '2024-10-11',
        scope: 'TikTok 全球内容审核业务',
        title: 'TikTok 确认全球内容审核业务裁减数百人',
        summary: 'Reuters 报道，TikTok 确认在内容审核运营调整中全球将有数百名员工受到影响，其中马来西亚团队受影响较多。',
        evidenceLevel: 'B',
        source: 'Reuters',
        sourceUrl: 'https://www.reuters.com/technology/bytedance-cuts-over-700-jobs-malaysia-shift-towards-ai-moderation-sources-say-2024-10-11/'
      },
      {
        id: 'bytedance-intern-conversion-2024',
        type: 'intern_conversion',
        sentiment: 'mixed',
        date: '2024-07-16',
        scope: '实习留用',
        title: '社区汇总称近年 HC 收紧后转正竞争加大',
        summary: '牛客社区 2024 年经验汇总称，字节部分团队实习留用受 HC 和产出竞争影响较大。该信息为社区经验，不代表公司统一政策或当前转正率。',
        evidenceLevel: 'C',
        source: '牛客社区经验汇总',
        sourceUrl: 'https://www.nowcoder.com/feed/main/detail/a52a75f0379048b1a07065c58329bc12'
      }
    ]
  },
  {
    company: '蔚来',
    aliases: ['NIO', '上海蔚来汽车'],
    events: [
      {
        id: 'nio-workforce-cut-2023-11',
        type: 'layoff',
        sentiment: 'negative',
        date: '2023-11-03',
        scope: '公司整体',
        title: '公司宣布减少约 10% 岗位以提升效率',
        summary: 'Reuters 后续报道回顾，蔚来在 2023 年 11 月宣布计划削减约 10% 员工，以提升效率并降低成本。',
        evidenceLevel: 'B',
        source: 'Reuters',
        sourceUrl: 'https://www.reuters.com/business/autos-transportation/chinese-ev-startup-nio-sets-starting-price-new-version-et7-sedan-2024-04-25/'
      }
    ]
  },
  {
    company: '特斯拉',
    aliases: ['Tesla', '特斯拉中国'],
    events: [
      {
        id: 'tesla-global-layoff-2024-04',
        type: 'layoff',
        sentiment: 'negative',
        date: '2024-04-16',
        scope: '全球；含中国销售团队',
        title: '全球裁员超过 10%，中国销售团队亦受影响',
        summary: 'Reuters 查看到的 CEO 内部备忘录显示，特斯拉计划全球裁员超过 10%；Reuters 同时报道称中国销售团队有人员受到影响。',
        evidenceLevel: 'B',
        source: 'Reuters',
        sourceUrl: 'https://www.reuters.com/business/autos-transportation/teslas-global-job-cuts-include-leading-markets-us-china-2024-04-16/'
      }
    ]
  },
  {
    company: '小红书',
    aliases: ['Xiaohongshu', 'RED'],
    events: [
      {
        id: 'xiaohongshu-intern-conversion-2024',
        type: 'intern_conversion',
        sentiment: 'negative',
        date: '2024-04-17',
        scope: '暑期实习留用',
        title: '社区多次出现“转正率偏低、需确认 HC”的提醒',
        summary: '牛客 2024 年多条讨论中出现小红书实习留用率偏低、需提前确认组内 HC 的反馈。该类内容为匿名社区经验，只能作为面试反问和风险核验线索。',
        evidenceLevel: 'C',
        source: '牛客社区',
        sourceUrl: 'https://www.nowcoder.com/feed/main/detail/2ebf375e29ea42ecafbfaa0e5f52e306'
      }
    ]
  },
  {
    company: '美团',
    aliases: ['Meituan'],
    events: [
      {
        id: 'meituan-intern-conversion-2024',
        type: 'intern_conversion',
        sentiment: 'positive',
        date: '2024-03-26',
        scope: '暑期实习留用',
        title: '社区/校园大使经验称往年整体留用比例较高',
        summary: '一篇牛客校园大使经验帖称，美团往年实习整体留用比例约 70%–80%，并给出 24 届整体 73% 的说法。该数据不是公司财报或正式公告，按社区证据处理。',
        evidenceLevel: 'C',
        source: '牛客社区/校园大使经验帖',
        sourceUrl: 'https://www.nowcoder.com/discuss/601894434199924736'
      }
    ]
  },
  {
    company: '得物App',
    aliases: ['得物', '上海识装信息科技有限公司', 'Poizon'],
    events: [
      {
        id: 'dewu-org-efficiency-2024-08',
        type: 'layoff',
        sentiment: 'negative',
        date: '2024-08-07',
        scope: '公司组织提效；低投入产出项目和岗位',
        title: '全员信称启动组织提效，测算减少约 5% 岗位',
        summary: '第一财经、澎湃等媒体报道得物全员信：公司决定精简低投入产出项目并启动组织提效，测算减少约 5% 岗位，同时表示将依法提供经济补偿。该历史事件不代表当前团队一定仍在缩编。',
        evidenceLevel: 'B',
        source: '第一财经（引用得物全员信）',
        sourceUrl: 'https://www.yicai.com/news/102224056.html'
      }
    ]
  },
  {
    company: '安克创新',
    aliases: ['Anker', 'Anker Innovations', '安克创新科技股份有限公司'],
    events: [
      {
        id: 'anker-org-adjustment-2025-12',
        type: 'layoff',
        sentiment: 'negative',
        date: '2025-12-31',
        scope: '业务线整合及部分人员调整',
        title: '公司确认存在正常人员调整，并否认“裁员 30%”传闻',
        summary: '界面新闻报道，安克创新回应称人员变动属于战略升级和效率提升下的正常调整，网络流传的“30%”比例严重不属实；公司未披露具体调整比例。因此只能确认存在人员调整，不能把“30%”作为事实。',
        evidenceLevel: 'B',
        source: '界面新闻（东方财富转载）',
        sourceUrl: 'https://finance.eastmoney.com/a/202512313607079367.html'
      }
    ]
  }
];

export const companyRiskMethodology = {
  evidenceLevels: {
    A: '一手材料',
    B: '高可信媒体/公司回应',
    C: '社区经验线索',
    D: '未经核实传闻（默认隐藏）'
  },
  principles: [
    '事件按发生时点和具体业务范围展示，不把历史事件自动外推为当前全公司状态。',
    '社区关于实习转正、HC、加班等内容只作为面试反问/核验线索，不作为事实结论。',
    '不因单一历史事件生成公司黑名单分数；最终是否值得投由 campus-job-board 规则决定。'
  ]
};
