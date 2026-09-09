// S/A/B 当前重点公司的补充历史风险情报。
// 证据口径与 company-risk-history.js 完全一致：A=一手材料，B=高可信媒体/公司回应，C=可追溯社区线索，D=未经核实（默认隐藏）。
export const priorityCompanyRiskHistory = [
  {
    company: '名创优品',
    aliases: ['MINISO', '名创优品集团'],
    events: [
      {
        id: 'miniso-pay-adjustment-covid-2020-02',
        type: 'compensation',
        sentiment: 'negative',
        date: '2020-02-21',
        scope: '新冠疫情特殊时期的集团员工调薪倡议',
        title: '疫情期间调薪倡议引发“是否自愿”争议，公司回应并调整1月薪资处理',
        summary: '界面新闻报道，名创优品在疫情冲击下向员工发出“共克时艰”调薪倡议，部分员工质疑实际选择空间；公司回应称倡议坚持自愿、调查中97.7%员工支持，并在反馈后将1月份薪资足额发放。该事件发生于2020年疫情特殊经营环境，不能外推为当前薪酬政策。',
        evidenceLevel: 'B',
        source: '界面新闻（含公司正式回应）',
        sourceUrl: 'https://www.jiemian.com/article/4031710.html'
      }
    ]
  },
  {
    company: '零跑汽车',
    aliases: ['零跑', 'Leapmotor', '浙江零跑科技股份有限公司'],
    events: [
      {
        id: 'leapmotor-overseas-org-restructure-2024-05',
        type: 'restructuring',
        sentiment: 'mixed',
        date: '2024-05-31',
        scope: '海外业务与营销体系',
        title: '海外拓展部撤销，原海外团队转入产品、服务与管销运营等部门',
        summary: '界面新闻及21财经报道，零跑在与Stellantis组建零跑国际后调整海外与营销组织：公司不再单独设置海外拓展部门，原相关团队成员分别转入整车产品线、服务部和管销运营部，并继续与零跑国际对接。该事件是组织模式变化，不等同于裁员，但对国际业务岗位的组织归属与汇报关系具有参考意义。',
        evidenceLevel: 'B',
        source: '界面新闻 / 21财经',
        sourceUrl: 'https://www.jiemian.com/article/11238558.html'
      }
    ]
  },
  {
    company: '致欧家居',
    aliases: ['致欧科技', '致欧家居科技股份有限公司', 'SONGMICS HOME'],
    events: [
      {
        id: 'songmics-rd-headcount-org-2025',
        type: 'restructuring',
        sentiment: 'mixed',
        date: '2026-04-29',
        scope: '2025年度研发人员结构与组织优化',
        title: '2025年报显示研发人员同比减少15.79%，同时持续推进组织架构优化',
        summary: '致欧家居2025年度报告披露，研发人员由2024年的304人降至2025年的256人，同比减少15.79%；此前年度报告亦提出持续调整和优化组织架构、减少多余流程与管理动作。公开材料未将研发人数变化定义为裁员，因此这里只记录人员结构与组织优化事实。',
        evidenceLevel: 'A',
        source: '致欧家居科技股份有限公司2025年度报告（巨潮资讯）',
        sourceUrl: 'https://static.cninfo.com.cn/finalpage/2026-04-29/1225281007.PDF'
      }
    ]
  }
];
