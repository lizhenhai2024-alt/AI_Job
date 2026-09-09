// Curated official recruitment entry points used as deterministic discovery seeds.
// A seed is NOT an approved source by itself: source discovery must still pass
// company identity, ATS/provider, 2027 cohort and API/page probes before registration.
// graduationYear/cohortEvidence are only set where the 2027 campaign was separately verified.
export const companySourceSeeds = [
  { company: '腾讯', url: 'https://careers.tencent.com/', note: '腾讯官方招聘站；含校园招聘入口', verifiedAt: '2026-09-09' },
  { company: '阿里巴巴', url: 'https://www.alibabagroup.com/en-US/careers', note: 'Alibaba Group 官方 Careers', verifiedAt: '2026-09-09' },
  { company: 'Lazada', url: 'https://www.lazada.com/en/careers/', note: 'Lazada 官方 Careers', verifiedAt: '2026-09-09' },
  { company: '爱奇艺', url: 'https://careers.iqiyi.com/', note: '爱奇艺官方招聘；含应届生招聘', verifiedAt: '2026-09-09' },
  { company: '美团', url: 'https://career.meituan.com/web/campus?source=mtgw', note: '美团官方校园招聘', verifiedAt: '2026-09-09' },
  { company: '拼多多', url: 'https://careers.pddglobalhr.com/campus/grad', note: 'PDD官方校园招聘', graduationYear: '2027', cohortEvidence: 'PDD 2027届校园招聘正式批', verifiedAt: '2026-09-09' },
  { company: '名创优品', url: 'https://miniso.zhiye.com/campus', note: '名创优品官方北森校园招聘', graduationYear: '2027', cohortEvidence: '名创优品2027届校园招聘已启动', verifiedAt: '2026-09-09' },
  { company: '小红书', url: 'https://campus.xiaohongshu.com/', note: '小红书官方校园招聘入口', verifiedAt: '2026-09-09' },
  { company: '字节跳动', url: 'https://jobs.bytedance.com/campus/position', note: '字节跳动官方校园招聘职位入口', verifiedAt: '2026-09-09' },
  { company: 'TikTok', url: 'https://lifeattiktok.com/', note: 'TikTok官方招聘站', verifiedAt: '2026-09-09' },
  { company: 'Amazon', url: 'https://www.amazon.jobs/content/en/career-programs/university/undergraduate-non-tech', note: 'Amazon官方大学生/毕业生非技术项目入口', verifiedAt: '2026-09-09' },
  { company: 'Bilibili', url: 'https://www.bilibili.com/blackboard/join-list.html', note: '哔哩哔哩官方招聘职位页', verifiedAt: '2026-09-09' },
  { company: '致欧家居', url: 'https://songmicshome.jobs.feishu.cn/852372', note: '致欧家居官方飞书校园招聘入口', graduationYear: '2027', cohortEvidence: '致欧家居2027届校园招聘', verifiedAt: '2026-09-09' },
  { company: 'Shopee', url: 'https://app.mokahr.com/campus_apply/shopee/2962#/jobs', note: 'Shopee研发中心官方Moka校园招聘入口', graduationYear: '2027', cohortEvidence: 'Shopee研发中心2027届校园招聘', verifiedAt: '2026-09-09' },
  { company: '三一集团', url: 'https://sanycampus.zhiye.com/campus/jobs', note: '三一集团官方北森校园招聘入口', graduationYear: '2027', cohortEvidence: '三一集团2027届校园招聘', verifiedAt: '2026-09-09' },
  { company: '福耀玻璃', url: 'https://job.fuyaogroup.com/', note: '福耀集团官方校园招聘入口；用于逐岗位官网核验', graduationYear: '2027', cohortEvidence: '福耀集团2027届校园招聘已启动', verifiedAt: '2026-09-09' },

  // 2026-09-10：广州/杭州外企补充清单——仅登记已核验的公司官方招聘入口。
  // 附件中的“在招/待确认”不会直接继承；只有官网存在明确2027证据时才写 graduationYear/cohortEvidence。
  { company: '欧莱雅', url: 'https://www.loreal.com/en/careers/', note: 'L’Oréal 官方 Careers；进入后继续核验中国校招与具体岗位', verifiedAt: '2026-09-10' },
  { company: '联合利华', url: 'https://careers.unilever.com/', note: 'Unilever 官方 Careers；继续核验中国 Future Leaders/毕业生岗位', verifiedAt: '2026-09-10' },
  { company: 'Nike', url: 'https://careers.nike.com/zh-cn/', note: 'Nike 官方中国招聘站；当前职位与学生项目需岗位级核验', verifiedAt: '2026-09-10' },
  { company: 'Adidas', url: 'https://careers.adidas-group.com/', note: 'adidas 官方 Careers；上海等中国职位可检索，2027届需岗位级核验', verifiedAt: '2026-09-10' },
  { company: 'Zara', url: 'https://www.inditexcareers.com/portalweb/zh-CN/web/joinfashion/offers', note: 'Inditex 官方招聘职位页；覆盖 Zara 等品牌', verifiedAt: '2026-09-10' },
  { company: '雀巢', url: 'https://app.mokahr.com/campus-recruitment/nestlegcr', note: '雀巢大中华区官方 Moka 校园招聘入口；仓库已有官方源', verifiedAt: '2026-09-10' },
  { company: '马士基', url: 'https://www.maersk.com/careers/our-teams/students-graduates', note: 'Maersk 官方 Students & Graduates；继续核验中国具体校招岗位', verifiedAt: '2026-09-10' },
  { company: '道达尔', url: 'https://careers.totalenergies.com/en', note: 'TotalEnergies 官方 Careers；继续核验中国毕业生/商业岗位', verifiedAt: '2026-09-10' },
  { company: 'Shell', url: 'https://www.shell.com.cn/careers/students-and-graduates/shell-graduate-programme.html', note: 'Shell 中国官方毕业生项目入口；Workday 已发现 2027 China 项目，地点字段与JD正文需保持冲突标记', graduationYear: '2027', cohortEvidence: 'Shell Graduate Programme 2027 - China（2027届）', verifiedAt: '2026-09-10' },
  { company: 'BP', url: 'https://careers.bp.com/early-careers/graduates', note: 'bp 官方 Graduate careers；中国2027具体岗位仍需官网逐岗确认', verifiedAt: '2026-09-10' },
  { company: '百胜中国', url: 'https://www.yumchina.com/career/', note: '百胜中国官方招聘页；明确包含校园招聘与营销/供应链管培生方向', verifiedAt: '2026-09-10' },
  { company: '玛氏', url: 'https://careers.mars.com/cn/zh/students-graduates', note: 'Mars 中国官方校园招聘与毕业生项目入口', verifiedAt: '2026-09-10' },
  { company: '博世', url: 'https://app.mokahr.com/campus-recruitment/bosch/75909?locale=zh-CN', note: '博世中国官方 Moka 校园招聘入口；仓库已有2027严格届别官方源', verifiedAt: '2026-09-10' },
  { company: '施耐德', url: 'https://careers.se.com/early-careers', note: 'Schneider Electric 官方 Early Careers；中国2027具体岗位需岗位级核验', verifiedAt: '2026-09-10' },
  { company: 'SAP', url: 'https://jobs.sap.com/', note: 'SAP 官方职位站；学生/毕业生岗位与中国地点继续逐岗核验', verifiedAt: '2026-09-10' },
  { company: 'Philips', url: 'https://www.careers.philips.com/student/apac/en/', note: 'Philips APAC 官方 Student/Graduate 页面；包含 Graduate Development Program', verifiedAt: '2026-09-10' },
  { company: 'LVMH', url: 'https://www.lvmh.cn/job-offers', note: 'LVMH 中国官方招聘页；中国大陆最新招聘动态以官方渠道为准', verifiedAt: '2026-09-10' },
  { company: 'Kering', url: 'https://www.kering.com/cn/talent/job-offers-cn/', note: 'Kering 官方中国职位页；继续筛选应届/正式岗位，排除实习与纯销售', verifiedAt: '2026-09-10' },
  { company: 'H&M', url: 'https://career.hm.com/cn-zh/', note: 'H&M 中国大陆官方 Careers；含 Student & Early Careers 入口', verifiedAt: '2026-09-10' },
  { company: 'LEGO', url: 'https://www.lego.com/zh-cn/careers', note: 'LEGO 官方中国 Careers；上海覆盖销售营销、运营等职能', verifiedAt: '2026-09-10' },
  { company: 'Decathlon', url: 'https://recruitment.decathlon.com.cn/p/campus.html', note: '迪卡侬中国官方校园招聘；官方页面已确认2027秋季招聘并链接HotJob职位系统', graduationYear: '2027', cohortEvidence: '迪卡侬2027秋季招聘，面向2027届应届毕业生', verifiedAt: '2026-09-10' },
  { company: 'BASF', url: 'https://www.basf.com/cn/zh/careers/graduates', note: 'BASF 中国官方毕业生页面；成长毕业生计划当前开放，具体2027届资格需岗位级确认', verifiedAt: '2026-09-10' },
  { company: 'ABB', url: 'https://careers.abb/china/zh/early-careers', note: 'ABB 中国官方 Early Careers；含 Global Early Talent/Discovery 等项目', verifiedAt: '2026-09-10' },
  { company: 'Dyson', url: 'https://careers.dyson.com/en-gb/what-you-can-do/early-careers/china/', note: 'Dyson 官方 China Early Careers；包含中国毕业生项目', verifiedAt: '2026-09-10' },
  { company: 'Hermes', url: 'https://talents.hermes.com/zh-CN/sites/CX/jobs', note: 'Hermès 官方职位站；中国岗位继续核验届别/地点/岗位性质', verifiedAt: '2026-09-10' },
  { company: 'ZF', url: 'https://jobs.zf.com/go/Students/3636101/', note: 'ZF 官方 Students 职位页；中国学生岗位可检索，正式2027届需逐岗确认', verifiedAt: '2026-09-10' }
];
