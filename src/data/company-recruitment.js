// 公司校招招聘流程与薪酬情报（2027届校园招聘，检索日期 2026-09-17）。
// 依据：官方校招门户 / 官网招聘页 / 官方公众号 / 高校就业网转载官方简章；主表 JD 薪资。
// 字段说明：
// - salary: 校招代表性薪酬（优先 HR/市场/运营/产品/GTM 类岗位口径；实施类岗位不采纳；查不到标「面议/未公布」）
// - recruitmentProcess: 官方招聘流程步骤链；官方未明确时标注「推测」
// - writtenTest: 有无笔试/测评（有/无/待核实）+ 类型说明
// - 每条情报的 source: { level, name, url, retrievalDate }；
//   level: E1=官方原文 E2=官方页面 E3=官方转载 E4=二手来源 E5=推测
export const companyRecruitment = [
  {
    company: "蔚来", 
    salary: "9.5K-14.5K/月（校招-商务管理岗）",
    salarySource: {"level": "E2", "name": "主表JD薪资", "url": "https://nio.jobs.feishu.cn/campus/m/", "retrievalDate": "2026-09-17"},
    recruitmentProcess: "网申&内推→笔试/测评→面试→Offer发放",
    processSource: {"level": "E1", "name": "蔚来校招官网招聘动态", "url": "https://campus.nio.com/?theme=dark#/trends", "retrievalDate": "2026-09-17"},
    writtenTest: "有（在线笔试/测评，所有岗位均安排；含性格测评+专业笔试）",
    testSource: {"level": "E1", "name": "蔚来校招官网FAQ", "url": "https://campus.nio.com/?theme=dark#/trends", "retrievalDate": "2026-09-17"}
  },
  {
    company: "小米", 
    salary: "市场/职能文职约12-18万/年；产品/设计约22-30万/年（公司整体，二手来源）",
    salarySource: {"level": "E4", "name": "联索科技引述上岸数据", "url": "https://www.lexotech.com/news/news-content?did=6953f91f205eded2d956713daf936ef9", "retrievalDate": "2026-09-17"},
    recruitmentProcess: "网申/内推→在线测评→简历筛选→面试（2-3轮）→Offer发放",
    processSource: {"level": "E1", "name": "小米招聘官网校招流程", "url": "https://hr.xiaomi.com/website/campus.html", "retrievalDate": "2026-09-17"},
    writtenTest: "有（在线测评=专项能力测试+性格测评；仅部分技术岗需笔试）",
    testSource: {"level": "E1", "name": "小米招聘官网FAQ", "url": "https://hr.xiaomi.com/m/campus/recruitment?tabId=3", "retrievalDate": "2026-09-17"}
  },
  {
    company: "得物App", 
    salary: "技术岗年薪30W-45W；非技术岗（运营/市场类）面议/未公布",
    salarySource: {"level": "E2", "name": "东北大学就业网校招公告", "url": "http://job.neu.edu.cn/campus/view/id/562460", "retrievalDate": "2026-09-17"},
    recruitmentProcess: "投递&内推→笔试/测评→面试→Offer沟通与发放",
    processSource: {"level": "E2", "name": "郑州大学就业网校招简章", "url": "https://job.zzu.edu.cn/campus/view/id/1018722", "retrievalDate": "2026-09-17"},
    writtenTest: "有（技术岗牛客网专业笔试；非技术岗为测评）",
    testSource: {"level": "E1", "name": "得物校招官网FAQ", "url": "https://poizon.jobs.feishu.cn/578078/m/page-shvd6g", "retrievalDate": "2026-09-17"}
  },
  {
    company: "Decathlon（迪卡侬）", 
    salary: "线上运营主管 8K-10K/月（运营岗，上海）；运动部门经理 9K-12K/月（零售管理岗）",
    salarySource: {"level": "E4", "name": "猎聘官方JD/职友集", "url": "https://www.liepin.com/job/1985458733.shtml", "retrievalDate": "2026-09-17"},
    recruitmentProcess: "零售门店岗：简历投递→意向沟通(电话/视频)→集体面试(线下面试)/线上视频面试→工作体验→终面→Offer；全球采购与智能制造岗：投递简历→线上测试→线下面试→…→Offer",
    processSource: {"level": "E2", "name": "迪卡侬中国校招官网", "url": "https://recruitment.decathlon.com.cn/p/campus.html", "retrievalDate": "2026-09-17"},
    writtenTest: "有（全球采购/智能制造事业部设线上测试；零售门店岗流程未列统一笔试，待核实）",
    testSource: {"level": "E2", "name": "迪卡侬中国校招官网", "url": "https://recruitment.decathlon.com.cn/p/campus.html", "retrievalDate": "2026-09-17"}
  },
  {
    company: "小鹏汽车", 
    salary: "面议/未公布（本科整体约6K-11K/月，来源校招简章；HR/运营/市场类岗位具体薪资未单独公布）",
    salarySource: {"level": "E3", "name": "东北大学就业网校招简章", "url": "http://job.neu.edu.cn/campus/view/id/562343", "retrievalDate": "2026-09-17"},
    recruitmentProcess: "网申/内推→AI测评→笔试（部分岗位）→面试→offer→签约入职",
    processSource: {"level": "E2", "name": "南开大学就业指导中心校招简章", "url": "https://career.nankai.edu.cn/correcruit/content/id/116251.html", "retrievalDate": "2026-09-17"},
    writtenTest: "有（AI测评+部分岗位在线笔试）",
    testSource: {"level": "E2", "name": "南开大学就业指导中心校招简章", "url": "https://career.nankai.edu.cn/correcruit/content/id/116251.html", "retrievalDate": "2026-09-17"}
  },
  {
    company: "海信", 
    salary: "面议/未公布（官方称\"薪酬不设上限\"，未公布具体区间；提供免费公寓/班车/住房补贴等福利）",
    salarySource: {"level": "E2", "name": "西安电子科技大学就业信息网校招简章", "url": "https://job.xidian.edu.cn/campus/view/id/756874", "retrievalDate": "2026-09-17"},
    recruitmentProcess: "简历筛选→线上测评（研发技术类需笔试）→AI面试（含英语口语）→无领导小组面试→专业/综合面试→总部面试→offer及签约",
    processSource: {"level": "E2", "name": "广东外语外贸大学就业信息网海信全球营销中心校招", "url": "https://career.gdufs.edu.cn/web/Index/jobs-brief-detail?id=VHUXSN0", "retrievalDate": "2026-09-17"},
    writtenTest: "有（线上测评+AI面试含英语口语；研发类增设笔试；非技术岗以线上测评+AI面试为主）",
    testSource: {"level": "E2", "name": "南开大学就业指导中心海信信动力计划校招", "url": "https://career.nankai.edu.cn/correcruit/content/id/115685.html", "retrievalDate": "2026-09-17"}
  },
  {
    company: "字节跳动", 
    salary: "产品/核心运营岗约20-30万/年（公司整体，二手来源）；技术岗22-35万/年",
    salarySource: {"level": "E4", "name": "抖音校招薪资盘点", "url": "https://www.iesdouyin.com/share/video/7644730191775911203", "retrievalDate": "2026-09-17"},
    recruitmentProcess: "投递→（笔试视岗位安排）→面试→Offer",
    processSource: {"level": "E1", "name": "字节跳动校招官网FAQ", "url": "https://jobs.bytedance.com/campus/m/page-6272Gc", "retrievalDate": "2026-09-17"},
    writtenTest: "有（在线笔试，视岗位匹配度安排；技术岗编程测试，非技术岗skills assessment）",
    testSource: {"level": "E1", "name": "字节跳动校招官网FAQ", "url": "https://jobs.bytedance.com/campus/m/page-6272Gc", "retrievalDate": "2026-09-17"}
  },
  {
    company: "阿里巴巴", 
    salary: "11K-20K/月（公司整体，官方校招页）；非技术岗约16K×16薪≈25万/年",
    salarySource: {"level": "E2", "name": "东北大学就业网校招公告", "url": "http://job.neu.edu.cn/campus/view/id/562412", "retrievalDate": "2026-09-17"},
    recruitmentProcess: "网申/内推→测评/笔试（部分职类）→面试→Offer",
    processSource: {"level": "E2", "name": "北师大就业网校招公告", "url": "https://career.bnu.edu.cn/frontpage/mobile/dist/index.html#/recruitmentinfoForm?positionDetailId=20df7750b996483790e460f51854994b", "retrievalDate": "2026-09-17"},
    writtenTest: "有（在线测评+集中笔试，技术/游戏等职类需笔试）",
    testSource: {"level": "E2", "name": "中国地质大学就业网校招公告", "url": "https://jiuye.cugb.edu.cn/Zhaopin/xiaozhao.html?id=8a53b06b-670b-0721-65e4-b6bf87f600af", "retrievalDate": "2026-09-17"}
  },
  {
    company: "快手", 
    salary: "9.5K-14.5K/月（商业化销售运营专员岗，主表）；校招整体约20K-40K×16薪",
    salarySource: {"level": "E2", "name": "主表JD薪资", "url": "https://campus.kuaishou.cn/", "retrievalDate": "2026-09-17"},
    recruitmentProcess: "投递→测评（认知测评+AI素养测评）→简历筛选→面试→Offer",
    processSource: {"level": "E2", "name": "浙江大学就业服务平台", "url": "https://www.career.zju.edu.cn/jyxt/sczp/zpztgl/ckZpgwXq.zf?zpxxbh=5A03D470E12EAD6FE0653A68DD0E9B18", "retrievalDate": "2026-09-17"},
    writtenTest: "有（在线测评=认知测评+AI素养测评；部分岗位需笔试）",
    testSource: {"level": "E4", "name": "牛客网校招内推帖", "url": "https://m.nowcoder.com/feed/main/detail/4de1ce25780a4bed9063225a1b415794", "retrievalDate": "2026-09-17"}
  },
  {
    company: "Babycare", 
    salary: "9.5K-14.5K/月（HR/品牌策划/运营/产品管培生岗）；综合年薪约13-20W",
    salarySource: {"level": "E2", "name": "官方校招JD（主表岗位数据）", "url": "https://babycare.jobs.feishu.cn/campus/m", "retrievalDate": "2026-09-17；E3"},
    recruitmentProcess: "网申(2026/7/31启动)→线下宣讲会(9/21起)→面试环节(9/23起，线上/线下)→Offer(11月起)→入职(2027/7)",
    processSource: {"level": "E3", "name": "浙大就业平台校招流程原文", "url": "https://www.career.zju.edu.cn/jyxt/sczp/xjhgl/ckXjhgwXq.zf?dwxxid=JG1202310&xjhbh=0e00805aad83114100dcbf01fbfc0b0e", "retrievalDate": "2026-09-17"},
    writtenTest: "待核实（历史校招含AI面试/在线测评，2027届官方流程未明确单列测评环节）",
    testSource: {"level": "E4", "name": "PreTalent历史校招测评攻略", "url": "https://www.pretalent.com.cn/blog/pretalent-babycare-2024", "retrievalDate": "2026-09-17"}
  },
  {
    company: "拓竹科技（Bambu Lab）", 
    salary: "面议/未公布（官方称“匹配一线大厂薪资方案、不设上限的超高年终”，未公布具体区间）",
    salarySource: {"level": "E3", "name": "北京化工大学就业网校招公告", "url": "https://jobmob.buct.edu.cn/xiaozhao/details.html?id=3713e783-404a-48c7-c68e-17c2461ffb88", "retrievalDate": "2026-09-17"},
    recruitmentProcess: "1分钟极简网申→简历初筛→3~4轮面试→Offer沟通",
    processSource: {"level": "E3", "name": "武汉本地宝转载官方校招公告", "url": "http://wh.bendibao.com/job/2026817/199816.shtm", "retrievalDate": "2026-09-17"},
    writtenTest: "无（官方明确：校招岗位面试前无统一笔试；仅软件开发类岗位面试中设代码考核）",
    testSource: {"level": "E3", "name": "北京化工大学就业网校招公告", "url": "https://jobmob.buct.edu.cn/xiaozhao/details.html?id=3713e783-404a-48c7-c68e-17c2461ffb88", "retrievalDate": "2026-09-17"}
  },
  {
    company: "美团", 
    salary: "服务流程运营13-18K×15薪；商户/客户管培生6-8K×13薪",
    salarySource: {"level": "E3", "name": "BOSS直聘校招JD", "url": "https://www.zhipin.com/zhaopin/5f374a4617bc5d670nd-2N-7EA~~/", "retrievalDate": "2026-09-17"},
    recruitmentProcess: "网申→集中笔试→AI面试（部分岗位）→面试→录用意向书",
    processSource: {"level": "E1", "name": "美团招聘官网校招行程", "url": "https://join.meituan.com/web/campus/schedule", "retrievalDate": "2026-09-17"},
    writtenTest: "有（在线集中笔试+部分岗位AI面试；零售/销售/客服类随到随测）",
    testSource: {"level": "E1", "name": "美团招聘官网FAQ", "url": "https://job.meituan.com/web/question/campus", "retrievalDate": "2026-09-17"}
  },
  {
    company: "腾讯", 
    salary: "产品岗年包约22.5-31.5万；技术岗普通offer约36-39万（公司整体，二手来源）",
    salarySource: {"level": "E4", "name": "牛客网数据引述", "url": "https://blxwnews.benliuxinwen.com/Share/ArticleShare?ArticleId=3614080", "retrievalDate": "2026-09-17"},
    recruitmentProcess: "网申→在线测评→AI初面→多轮专业面→HR面→Offer发放",
    processSource: {"level": "E2", "name": "武汉本地宝校招公告", "url": "http://wh.bendibao.com/job/2026828/200204.shtm", "retrievalDate": "2026-09-17"},
    writtenTest: "有（在线测评；不设统一笔试，部分岗位有个性化笔试/AI实战考察）",
    testSource: {"level": "E1", "name": "腾讯校招官网FAQ", "url": "https://join.qq.com/detail.html?id=288", "retrievalDate": "2026-09-17"}
  },
  {
    company: "科大讯飞", 
    salary: "面议/未公布",
    salarySource: {"level": "E2", "name": "牛客网校招帖", "url": "https://www.nowcoder.com/feed/main/detail/a6e6b733cbe2482383ec491dfe3d6f9c", "retrievalDate": "2026-09-17"},
    recruitmentProcess: "网申/内推→测评→笔试（部分岗位）→线上面试（部分有AI面试）→Offer",
    processSource: {"level": "E2", "name": "武汉本地宝校招公告", "url": "http://wh.bendibao.com/job/2026729/199351.shtm", "retrievalDate": "2026-09-17"},
    writtenTest: "有（在线测评+部分岗位线上笔试，每周一场；部分岗位有AI面试）",
    testSource: {"level": "E2", "name": "北林大就业网校招公告", "url": "http://job.bjfu.edu.cn/frontpage/mobile/dist/index.html#/recruitmentinfoForm?positionDetailId=ce65ab96f52144299030ef1e9b2d94cd&", "retrievalDate": "2026-09-17"}
  },
  {
    company: "厦门象屿", 
    salary: "8.5K-9.5K/月（投管/人力/投发管培生）",
    salarySource: {"level": "E2", "name": "主表JD薪资+官方校招简章（南开大学就业网转载）", "url": "https://career.nankai.edu.cn/correcruit/content/id/117501.html", "retrievalDate": "2026-09-17"},
    recruitmentProcess: "线上投递→简历筛选→初试→测评→复试→offer",
    processSource: {"level": "E2", "name": "官方校招简章", "url": "https://career.nankai.edu.cn/correcruit/content/id/117501.html", "retrievalDate": "2026-09-17"},
    writtenTest: "有（在线测评）",
    testSource: {"level": "E2", "name": "官方校招简章", "url": "https://career.nankai.edu.cn/correcruit/content/id/117501.html", "retrievalDate": "2026-09-17"}
  },
  {
    company: "创维集团", 
    salary: "8K-11K/月（公司整体校招岗，技术研发工程师口径；实习期8K-10K，转正后10K以上；HR/市场/供应链类岗未单独公布）",
    salarySource: {"level": "E3", "name": "沈阳理工大学就业信息网校招简章", "url": "https://job.sylu.edu.cn/campus/view/id/707662", "retrievalDate": "2026-09-17"},
    recruitmentProcess: "线上投递→简历筛选→笔试/测评（部分岗位）→专业面试→综合面试（人资面试）→企业适应性培训→offer",
    processSource: {"level": "E2", "name": "南开大学就业指导中心创维校招简章", "url": "https://career.nankai.edu.cn/correcruit/content/id/116942.html", "retrievalDate": "2026-09-17"},
    writtenTest: "有（笔试/测评，部分岗位）",
    testSource: {"level": "E2", "name": "南开大学就业指导中心创维校招简章", "url": "https://career.nankai.edu.cn/correcruit/content/id/116942.html", "retrievalDate": "2026-09-17"}
  },
  {
    company: "沐瞳科技", 
    salary: "运营岗约15-25K×16薪≈24-40万/年（公司整体，二手来源）",
    salarySource: {"level": "E3", "name": "猎聘校招JD", "url": "https://m.liepin.com/company/8466125/", "retrievalDate": "2026-09-17"},
    recruitmentProcess: "网申→笔试/面试/测评（无统一笔试）→Offer",
    processSource: {"level": "E2", "name": "四川美术学院就业网校招简章", "url": "https://www.scfai.edu.cn/xsc/info/1015/20302.htm", "retrievalDate": "2026-09-17"},
    writtenTest: "有（SHL综合能力测试+性格测评；一轮笔试+两轮面试）",
    testSource: {"level": "E3", "name": "沐瞳校招FAQ文档", "url": "https://portal-oss.zhiye.com/104294/resource/83fd87fc-6317-400b-8682-e0f6ba8a91c4.html", "retrievalDate": "2026-09-17"}
  },
  {
    company: "拼多多", 
    salary: "15K-20K/月（公司整体，官方校招页）；市场管培生约30万/年",
    salarySource: {"level": "E2", "name": "南开大学就业网校招公告", "url": "https://career.nankai.edu.cn/correcruit/content/id/118118.html", "retrievalDate": "2026-09-17"},
    recruitmentProcess: "在线投递→简历筛选→线上笔试→面试→发放Offer",
    processSource: {"level": "E2", "name": "吉林大学就业网校招公告", "url": "https://jdjyw.jlu.edu.cn/portal/recruit/details?id=ffcbd0bd22b443cf86926e43188467ed", "retrievalDate": "2026-09-17"},
    writtenTest: "有（线上笔试=北森测评+牛客笔试）",
    testSource: {"level": "E4", "name": "牛客网提前批帖", "url": "https://m.nowcoder.com/feed/main/detail/91cbe9d76b684576b43fc420117da2c4", "retrievalDate": "2026-09-17"}
  },
  {
    company: "TCL华星光电", 
    salary: "面议/未公布（官方校招页未公布具体薪资区间；琥珀计划等项目岗薪资未公开）",
    salarySource: {"level": "E2", "name": "TCL官方校招门户", "url": "https://campus.tcl.com/campus/spring.html", "retrievalDate": "2026-09-17"},
    recruitmentProcess: "在线网申→在线测评→简历筛选→笔试（研发岗）→一面→二面→offer",
    processSource: {"level": "E2", "name": "TCL招聘官网琥珀计划页", "url": "https://zhaopin.tcl.com/campus/amber.html", "retrievalDate": "2026-09-17"},
    writtenTest: "有（在线测评必做+研发岗笔试；供应链/非技术岗以在线测评为主）",
    testSource: {"level": "E2", "name": "TCL官方校招门户", "url": "https://campus.tcl.com/campus/spring.html", "retrievalDate": "2026-09-17"}
  },
  {
    company: "图拉斯（TORRAS/蓝禾）", 
    salary: "起薪10W-25W/年（公司整体，本科年薪；营销/运营/产品/职能岗均适用）",
    salarySource: {"level": "E3", "name": "厦门理工/深圳北理莫斯科大学就业网校招公告", "url": "https://job.xmut.edu.cn/info/1007/11855.htm", "retrievalDate": "2026-09-17"},
    recruitmentProcess: "简历投递(9-12月)→面试(2-3轮，9月底开启)→Offer滚动发放(10月中起)→签订三方",
    processSource: {"level": "E3", "name": "深圳北理莫斯科大学就业网", "url": "https://career.smbu.edu.cn/detail/online?id=3598119", "retrievalDate": "2026-09-17"},
    writtenTest: "待核实（官方流程未提及笔试/测评环节，推测无统一笔试）",
    testSource: {"level": "E3", "name": "四川文理学院就业网校招公告", "url": "https://zsxy.sasu.edu.cn/info/1023/5524.htm", "retrievalDate": "2026-09-17"}
  },
  {
    company: "OPPO", 
    salary: "15K-20K/月（公司整体，官方校招页）；市场管培生约15K×15薪≈23万/年",
    salarySource: {"level": "E2", "name": "东北大学就业网校招公告", "url": "http://job.neu.edu.cn/campus/view/id/562381", "retrievalDate": "2026-09-17"},
    recruitmentProcess: "简历投递→简历筛选→测评→笔试&AI面试（部分岗位）→面试→Offer",
    processSource: {"level": "E2", "name": "西电就业网校招公告", "url": "https://job.xidian.edu.cn/campus/view/id/756587", "retrievalDate": "2026-09-17"},
    writtenTest: "有（心理测评+AI面试/笔试，针对部分岗位）",
    testSource: {"level": "E1", "name": "OPPO校招官网", "url": "https://careers.oppo.com/campus", "retrievalDate": "2026-09-17"}
  },
  {
    company: "致欧家居（SONGMICS HOME）", 
    salary: "运营类管培生约6K-15K/月·14薪（深圳网站运营管培生9-15K；郑州跨境电商/销售运营管培生6-11K）",
    salarySource: {"level": "E4", "name": "职友集/智联/企查查校招岗位JD", "url": "https://m.jobui.com/company/17007873/jobs/all/shenzhen/", "retrievalDate": "2026-09-17"},
    recruitmentProcess: "线上投递：简历投递→群面→线上笔试&测评→业务终面→定薪→Offer发放→三方签订；线下宣讲：宣讲→简历投递→HR现场初面→群面→线上笔试&测评→业务终面→定薪→Offer→三方",
    processSource: {"level": "E3", "name": "郑州大学/西安交大就业网校招简章", "url": "https://job.zzu.edu.cn/campus/view/id/1018843", "retrievalDate": "2026-09-17"},
    writtenTest: "有（线上笔试&测评）",
    testSource: {"level": "E3", "name": "郑州大学就业网校招简章", "url": "https://job.zzu.edu.cn/campus/view/id/1018843", "retrievalDate": "2026-09-17"}
  },
  {
    company: "携程集团", 
    salary: "10K-30K×15薪（业务运营/用户运营岗，官方JD）",
    salarySource: {"level": "E3", "name": "猎聘/职友集校招JD", "url": "https://m.jobui.com/company/12078481/salary/j/yewuyunying/exp0/", "retrievalDate": "2026-09-17"},
    recruitmentProcess: "网申→能力测评→AI面试→笔试（技术/设计）→面试→Offer",
    processSource: {"level": "E2", "name": "北航就业网校招公告", "url": "https://career.buaa.edu.cn/frontpage/buaa/html/recruitmentinfoForm.html?positionDetailId=9e0a26a486a44f3a85130be04bb993fd", "retrievalDate": "2026-09-17"},
    writtenTest: "有（能力测评+AI面试；研发/设计类专业笔试含AI Coding）",
    testSource: {"level": "E2", "name": "厦门大学校招公告", "url": "https://jy.xmu.edu.cn/campus/view/id/1002056", "retrievalDate": "2026-09-17"}
  },
  {
    company: "SHEIN（希音）", 
    salary: "面议/未公布（官方称“有竞争力的薪资，不同岗位存在差异，以实际HR沟通为准”）",
    salarySource: {"level": "E2", "name": "SHEIN校招官网/多高校就业网简章", "url": "https://careers.shein.cn/Students-&-Graduates", "retrievalDate": "2026-09-17"},
    recruitmentProcess: "投递(9/4起)→简历初筛→笔试(仅部分岗位)→面试(2-4轮)→Offer(9月下旬起)",
    processSource: {"level": "E2", "name": "SHEIN校招官网", "url": "https://careers.shein.cn/Students-&-Graduates", "retrievalDate": "2026-09-17"},
    writtenTest: "有（专业笔试，仅部分岗位；非笔试岗以邮件通知为准）",
    testSource: {"level": "E2", "name": "SHEIN校招官网", "url": "https://careers.shein.cn/Students-&-Graduates", "retrievalDate": "2026-09-17"}
  },
  {
    company: "传音控股（Transsion）", 
    salary: "面议/未公布（公司整体口径：“行业顶尖薪酬，不设上限”；研发岗参考13K-15K/月，市场/运营岗未单独公布）",
    salarySource: {"level": "E3", "name": "多高校就业网校招公告", "url": "https://jyw.gpnu.edu.cn/info/1148/12362.htm", "retrievalDate": "2026-09-17；E4"},
    recruitmentProcess: "简历投递→线上测评→专业笔试(部分岗位)→面试→发放Offer",
    processSource: {"level": "E3", "name": "广东技术师范大学/中国矿大就业网校招公告", "url": "https://jyw.gpnu.edu.cn/info/1148/12362.htm", "retrievalDate": "2026-09-17"},
    writtenTest: "有（线上测评+专业笔试，部分岗位）",
    testSource: {"level": "E3", "name": "广东技术师范大学就业网校招公告", "url": "https://jyw.gpnu.edu.cn/info/1148/12362.htm", "retrievalDate": "2026-09-17"}
  },
  {
    company: "德佑（Deeyeo 逸祥科技）", 
    salary: "8K-10K/月（启航计划管培生，郑州；电商运营/新媒体运营类岗）",
    salarySource: {"level": "E3", "name": "天津工业大学就业网校招公告", "url": "https://job.tiangong.edu.cn/correcruit/content/id/55438.html", "retrievalDate": "2026-09-17"},
    recruitmentProcess: "网申投递→简历初筛→初试→业务复试→高管终试（全流程可线上）",
    processSource: {"level": "E3", "name": "超级简历校招信息(转载官方)", "url": "https://www.chaojijianli.com/xiaozhao/deeyeo-2027-campus-recruitment-zhengzhou-12584-9021c1/", "retrievalDate": "2026-09-17"},
    writtenTest: "有（笔试，具体类型待核实；校招宣传提及“笔试面试等关键节点”）",
    testSource: {"level": "E2", "name": "Moka官方校招平台校园大使JD", "url": "https://app.mokahr.com/m/campus-recruitment/yxws/168223", "retrievalDate": "2026-09-17"}
  },
  {
    company: "安克创新（Anker）", 
    salary: "面议/未公布（公司整体：“具有市场竞争力的薪酬，顶尖人才薪酬上不封顶”，含业绩奖金/AI绩效津贴/经营分享奖）",
    salarySource: {"level": "E2", "name": "安克校招官网/多高校就业网简章", "url": "https://career.anker.com.cn/universities/recruitment/", "retrievalDate": "2026-09-17"},
    recruitmentProcess: "简历投递→测评&笔试→面试沟通(线上为主，部分终面线下)→Offer审批与发放",
    processSource: {"level": "E2", "name": "安克创新校招官网", "url": "https://career.anker.com.cn/universities/recruitment/", "retrievalDate": "2026-09-17"},
    writtenTest: "有（在线测评+CATA认知能力测评+创造者启航试炼；部分岗位另设笔试）",
    testSource: {"level": "E2", "name": "安克校招官网", "url": "https://career.anker.com.cn/universities/recruitment/", "retrievalDate": "2026-09-17；E4"}
  },
  {
    company: "泡泡玛特（POP MART）", 
    salary: "10K-15K/月（IP运营等校招岗，公司整体校招区间）",
    salarySource: {"level": "E3", "name": "南开大学/暨南大学就业网校招简章", "url": "https://career.nankai.edu.cn/correcruit/content/id/118589.html", "retrievalDate": "2026-09-17"},
    recruitmentProcess: "网申(即日起至11月下旬)→测评/笔试(如有，9月下旬起)→面试(9月下旬起)→Offer(滚动发放)",
    processSource: {"level": "E2", "name": "泡泡玛特校招官网", "url": "https://popmart.zhiye.com/Campus", "retrievalDate": "2026-09-17"},
    writtenTest: "有（在线测评/笔试，部分岗位“如有”）",
    testSource: {"level": "E2", "name": "泡泡玛特校招官网", "url": "https://popmart.zhiye.com/Campus", "retrievalDate": "2026-09-17"}
  },
  {
    company: "顾家家居", 
    salary: "本科年薪≥13万、研究生≥15万（公司整体校招；会员运营岗参考8K-12K/月）",
    salarySource: {"level": "E3", "name": "中央财经/西安电子/北京理工就业网校招简章", "url": "http://scc.cufe.edu.cn/frontpage/mobile/dist/index.html#/recruitmentinfoForm?positionDetailId=d14493ed69f9491493a4389d3ba544bc&", "retrievalDate": "2026-09-17"},
    recruitmentProcess: "网申投递→线下宣讲/线上AI初试→复试→在线测评→终试→Offer→签约",
    processSource: {"level": "E3", "name": "北京理工/对外经贸就业网校招简章", "url": "http://career.bit.edu.cn/frontpage/mobile/dist/index.html#/recruitmentinfoForm?positionDetailId=5352010761af4f339c24507cd2817021&", "retrievalDate": "2026-09-17"},
    writtenTest: "有（在线测评+AI初试）",
    testSource: {"level": "E3", "name": "北京理工就业网校招简章", "url": "http://career.bit.edu.cn/frontpage/mobile/dist/index.html#/recruitmentinfoForm?positionDetailId=5352010761af4f339c24507cd2817021&", "retrievalDate": "2026-09-17"}
  },
  {
    company: "NVIDIA 英伟达", 
    salary: "面议/未公布（中国区2027校招官方未公布薪资区间；以技术岗为主，HR/市场/GTM类岗位极少）",
    salarySource: {"level": "E2", "name": "NVIDIA中国校招官网(moka)", "url": "https://app.mokahr.com/campus-recruitment/nvidia", "retrievalDate": "2026-09-17"},
    recruitmentProcess: "网申（7月20日开启）→（部分职位在线笔试）→多轮面试→offer发放（10-11月）",
    processSource: {"level": "E2", "name": "中国地质大学就业网NVIDIA校招", "url": "https://jiuye.cugb.edu.cn/Zhaopin/xiaozhao.html?id=46033143-2fea-49d4-89e7-d358dc980a80&type=ff8a2ce4-f922-10f4-f3ce-4fa4dc99401a", "retrievalDate": "2026-09-17"},
    writtenTest: "有（部分职位在线笔试；技术岗可能含coding exercise/Hackerrank）",
    testSource: {"level": "E2", "name": "牛客网NVIDIA 2027校招官方答疑", "url": "https://m.nowcoder.com/feed/main/detail/31c73d4f28ff488cbb1ebca879732f81?urlSource=home-api", "retrievalDate": "2026-09-17"}
  },
  {
    company: "4399", 
    salary: "策划/市场运营类25-45万+/年；其他类20-40万+/年（公司整体，官方校招）",
    salarySource: {"level": "E2", "name": "四川美术学院就业网校招简章", "url": "https://www.scfai.edu.cn/xsc/info/1015/20442.htm", "retrievalDate": "2026-09-17"},
    recruitmentProcess: "网申→在线笔试→面试→Offer",
    processSource: {"level": "E1", "name": "4399校招官网流程", "url": "https://wx-hr.img4399.com/mobile/school/process", "retrievalDate": "2026-09-17"},
    writtenTest: "有（在线笔试，简历筛选通过后立即开启）",
    testSource: {"level": "E1", "name": "4399校招官网FAQ", "url": "https://wx-hr.img4399.com/mobile/school/question", "retrievalDate": "2026-09-17"}
  },
  {
    company: "赛轮轮胎", 
    salary: "本科综合年薪12W起，硕士15W起（公司整体口径）",
    salarySource: {"level": "E2", "name": "官方校招简章（对外经贸大学就业网）", "url": "https://aeo.uibe.edu.cn/front/zph.jspa?tid=2099678475878199297", "retrievalDate": "2026-09-17"},
    recruitmentProcess: "投递简历→测评→面试沟通→发放offer→录用签约",
    processSource: {"level": "E2", "name": "官方校招简章（大连海事大学就业网）", "url": "https://myjob.dlmu.edu.cn/campus/view/id/868435", "retrievalDate": "2026-09-17"},
    writtenTest: "有（在线测评）",
    testSource: {"level": "E2", "name": "官方校招简章", "url": "https://myjob.dlmu.edu.cn/campus/view/id/868435", "retrievalDate": "2026-09-17"}
  },
  {
    company: "英科医疗/英科再生", 
    salary: "营销类年薪15-30万（英科再生）；职能类年薪12-15万（英科医疗）",
    salarySource: {"level": "E2", "name": "官方校招简章（山东大学威海校区）", "url": "https://ie.wh.sdu.edu.cn/info/1399/5574.htm", "retrievalDate": "2026-09-17"},
    recruitmentProcess: "简历投递→岗位测评→面试（2-3轮，部分岗位AI面试）→offer发放→三方签约",
    processSource: {"level": "E2", "name": "官方校招简章（中国海洋大学）", "url": "https://mse.ouc.edu.cn/2026/0901/c28602a536357/page.htm", "retrievalDate": "2026-09-17"},
    writtenTest: "有（岗位测评+部分岗位AI面试）",
    testSource: {"level": "E2", "name": "官方校招简章", "url": "https://mse.ouc.edu.cn/2026/0901/c28602a536357/page.htm", "retrievalDate": "2026-09-17"}
  },
  {
    company: "vivo", 
    salary: "省公司销售管培生综合年薪8-10万；总部市场/产品岗面议/未公布",
    salarySource: {"level": "E2", "name": "安徽省大学生就业平台", "url": "http://www.ahbys.com/job2.html?cid=25660&jid=12762", "retrievalDate": "2026-09-17"},
    recruitmentProcess: "网申与初筛→线上笔试（仅研发岗）→线下面试→Offer发放",
    processSource: {"level": "E1", "name": "vivo校招官网流程", "url": "https://hr-campus.vivo.com/custom/a67785ee-f8ab-3bfb-379f-2273e31a477e", "retrievalDate": "2026-09-17"},
    writtenTest: "有（测评；线上笔试仅研发岗，9月15日一场）",
    testSource: {"level": "E2", "name": "湖南大学就业网校招公告", "url": "https://scc.hnu.edu.cn/detail/career?id=694321", "retrievalDate": "2026-09-17"}
  },
  {
    company: "宁德时代新能源科技股份有限公司", 
    salary: "面议/未公布（官方称\"行业内有竞争力薪资，顶尖人才薪酬不设上限\"，未公布具体区间；HR岗未单独披露）",
    salarySource: {"level": "E2", "name": "南开大学就业指导中心宁德时代校招", "url": "https://career.nankai.edu.cn/recruitment/content/type/2/id/6065.html", "retrievalDate": "2026-09-17"},
    recruitmentProcess: "网申投递→AI面试→在线测评→专业面试→offer发放",
    processSource: {"level": "E2", "name": "南开大学就业指导中心宁德时代校招", "url": "https://career.nankai.edu.cn/recruitment/content/type/2/id/6065.html", "retrievalDate": "2026-09-17"},
    writtenTest: "有（AI面试+在线测评）",
    testSource: {"level": "E2", "name": "南开大学就业指导中心宁德时代校招", "url": "https://career.nankai.edu.cn/recruitment/content/type/2/id/6065.html", "retrievalDate": "2026-09-17"}
  },
  {
    company: "万兴科技（Wondershare）", 
    salary: "公司整体：应届生平均年薪约50万（产研岗为主，研发岗首年最高可达100万）；主表“用户运营/品牌策划/GEO运营/产品GTM 30K-50K/月”数值异常偏高，与公司口径不符，待核实，非研发岗具体区间未公布",
    salarySource: {"level": "E3/E4", "name": "新湖南/新浪财经官方报道", "url": "https://www.hunantoday.cn/news/xhn/202608/33520320.html", "retrievalDate": "2026-09-17"},
    recruitmentProcess: "秋招直招：网申/内推→在线测评→面试(3-4轮)→Offer速递→三方签约；实习转正通道另含实习入职/答辩",
    processSource: {"level": "E3", "name": "兰州大学/南开大学就业网校招简章", "url": "https://job.lzu.edu.cn/html/22/article/2026/91240.html", "retrievalDate": "2026-09-17"},
    writtenTest: "有（在线测评+线上专业笔试；职能序列和部分岗位无笔试）",
    testSource: {"level": "E2", "name": "万兴科技校招FAQ官方页", "url": "https://www.wondershare.cn/campus-faq.html", "retrievalDate": "2026-09-17"}
  },
  {
    company: "扬腾创新", 
    salary: "运营/营销岗约8K-18K/月（亚马逊运营10-15K、eBay运营8-12K、全球市场营销10-18K）；精英计划生12K-27K/月",
    salarySource: {"level": "E2", "name": "官方校招JD（主表岗位数据）；E3", "url": "南华大学就业网校招公告", "retrievalDate": "https://jiuye.usc.edu.cn/campus/view/id/609961"},
    recruitmentProcess: "线上网申/现场投递→在线测评→面试→Offer发放→签约录用",
    processSource: {"level": "E3", "name": "广外/北二外/中国地质大学就业网校招简章", "url": "https://career.gdufs.edu.cn/index.php/web/Index/jobs-brief-detail?id=VSUXSMT", "retrievalDate": "2026-09-17"},
    writtenTest: "有（在线测评）",
    testSource: {"level": "E3", "name": "广外就业网校招简章", "url": "https://career.gdufs.edu.cn/index.php/web/Index/jobs-brief-detail?id=VSUXSMT", "retrievalDate": "2026-09-17"}
  },
  {
    company: "蒙牛", 
    salary: "本科年薪15万起（未来星/星动力管培生，绩效奖金约30%；销售岗底薪8000元/月）",
    salarySource: {"level": "E3", "name": "西北农林科技大学就业网校招公告", "url": "https://food.nwafu.edu.cn/zhdt/jyxx/124337570ad04f33b5576a6d95c1951c.htm", "retrievalDate": "2026-09-17"},
    recruitmentProcess: "网申报名(8/28起)→商业能力测评(8/29起)→AI面试(8/30起)→面试(9月起)→Offer发放(10月起)",
    processSource: {"level": "E3", "name": "中国传媒大学/郑州本地宝校招公告", "url": "https://jy.cuc.edu.cn/frontpage/mobile/dist/index.html#/recruitmentFairForm?id=9ef2cd40bd5940519c3525f0bd0423bd&", "retrievalDate": "2026-09-17"},
    writtenTest: "有（商业能力测评+AI面试）",
    testSource: {"level": "E3", "name": "中国传媒大学就业网校招公告", "url": "https://jy.cuc.edu.cn/frontpage/mobile/dist/index.html#/recruitmentFairForm?id=9ef2cd40bd5940519c3525f0bd0423bd&", "retrievalDate": "2026-09-17"}
  },
  {
    company: "普渡机器人", 
    salary: "面议/未公布（官方仅称「有竞争力的薪酬」；二手来源称销售底薪10K起）",
    salarySource: {"level": "E2", "name": "官方校招页", "url": "https://pudutech.zhiye.com/campus", "retrievalDate": "2026-09-17"},
    recruitmentProcess: "网申/内推→简历筛选→面试（2-3轮）→Offer→签约",
    processSource: {"level": "E2", "name": "官方校招简章（北京科技大学就业网）", "url": "https://job.ustb.edu.cn/frontpage/mobile/dist/index.html#/recruitmentinfoForm?positionDetailId=eca150bf68ee4436bc2825e6af986f28&", "retrievalDate": "2026-09-17"},
    writtenTest: "无（官方明确「本次校园招聘不设置测评及笔试环节」）",
    testSource: {"level": "E2", "name": "官方校招简章", "url": "https://job.ustb.edu.cn/frontpage/mobile/dist/index.html#/recruitmentinfoForm?positionDetailId=eca150bf68ee4436bc2825e6af986f28&", "retrievalDate": "2026-09-17"}
  },
  {
    company: "得力集团", 
    salary: "普通校招岗综合年薪9-15万，精英管培生年薪16-30万（公司整体口径）",
    salarySource: {"level": "E2", "name": "官方校招简章（淮北师范大学就业网）", "url": "https://jyzd.chnu.edu.cn/xsfw/gwxx/content_152297", "retrievalDate": "2026-09-17"},
    recruitmentProcess: "网申/招聘会投递→线上测评→初试→复试→offer签约",
    processSource: {"level": "E2", "name": "官方校招简章（吉林大学就业网）", "url": "https://jdjyw.jlu.edu.cn/mportal/recruit/details?id=35d967eaac4f4b5fb1bdc019305c7fd9", "retrievalDate": "2026-09-17"},
    writtenTest: "有（线上测评）",
    testSource: {"level": "E2", "name": "官方校招简章", "url": "https://jdjyw.jlu.edu.cn/mportal/recruit/details?id=35d967eaac4f4b5fb1bdc019305c7fd9", "retrievalDate": "2026-09-17"}
  },
  {
    company: "新浪集团", 
    salary: "面议/未公布",
    salarySource: {"level": "E1", "name": "新浪招聘官方微博", "url": "https://m.weibo.cn/detail/5333583847228123", "retrievalDate": "2026-09-17"},
    recruitmentProcess: "网申→AI测评+人才测评→无领导面试→高管面试→Offer发放",
    processSource: {"level": "E1", "name": "新浪招聘官方微博", "url": "https://m.weibo.cn/detail/5333314849474804", "retrievalDate": "2026-09-17"},
    writtenTest: "有（AI测评+人才测评）",
    testSource: {"level": "E1", "name": "新浪招聘官方微博", "url": "https://m.weibo.cn/detail/5333314849474804", "retrievalDate": "2026-09-17"}
  },
  {
    company: "水羊集团御泥坊", 
    salary: "2027届远洋校招岗 8K-9K/月（平台运营/线下运营/证券事务/供应链等岗）",
    salarySource: {"level": "E4", "name": "猎聘/智联官方校招JD", "url": "https://m.liepin.com/company-jobs/6588252/jc-N22/", "retrievalDate": "2026-09-17"},
    recruitmentProcess: "简历投递→简历评估→HR初试→专业面试(含笔试)→综合/终试→发放Offer",
    processSource: {"level": "E3", "name": "中南大学就业网校招简章及2024远洋计划PDF", "url": "https://career.csu.edu.cn/campus/view/id/582593", "retrievalDate": "2026-09-17"},
    writtenTest: "有（笔试+线上测评；9/15起面试&笔试，12月中终试）",
    testSource: {"level": "E3", "name": "中南大学就业网校招简章", "url": "https://career.csu.edu.cn/campus/view/id/582593", "retrievalDate": "2026-09-17"}
  },
  {
    company: "三一集团", 
    salary: "15K-20K/月（公司整体校招口径，基本工资+绩效+年终奖1-4个月，另含城市补贴2000元/月；国际运营/市场/海外销服管培生适用）",
    salarySource: {"level": "E2", "name": "华南师范大学就业网三一校招详情", "url": "http://career.scnu.edu.cn/detail/online?id=3575781", "retrievalDate": "2026-09-17"},
    recruitmentProcess: "网申→测评→HR面试→专面/终面→OFFER",
    processSource: {"level": "E2", "name": "吉林大学就业网三一校招", "url": "https://jdjyw.jlu.edu.cn/mportal/recruit/details?id=1495b60a048c4fdfa833d8630c85e0e6", "retrievalDate": "2026-09-17"},
    writtenTest: "有（在线测评）",
    testSource: {"level": "E2", "name": "吉林大学就业网三一校招", "url": "https://jdjyw.jlu.edu.cn/mportal/recruit/details?id=1495b60a048c4fdfa833d8630c85e0e6", "retrievalDate": "2026-09-17"}
  },
  {
    company: "慧策集团", 
    salary: "运营管培生6K-8K/月、销售支持8K-10K/月、策略运营10K-15K/月",
    salarySource: {"level": "E2", "name": "主表JD薪资", "url": "2026-09-17", "retrievalDate": "2026-09-17"},
    recruitmentProcess: "简历筛选→笔试/测评→线上面试→offer发放→三方签约→入职报到",
    processSource: {"level": "E2", "name": "官方校招简章（南开大学就业网）", "url": "https://career.nankai.edu.cn/correcruit/content/id/117200.html", "retrievalDate": "2026-09-17"},
    writtenTest: "有（笔试/测评）",
    testSource: {"level": "E2", "name": "官方校招简章", "url": "https://career.nankai.edu.cn/correcruit/content/id/117200.html", "retrievalDate": "2026-09-17"}
  },
  {
    company: "奥克斯集团", 
    salary: "7.5K-12.5K/月（公司整体校招岗，13-14薪；市场营销/人力资源类岗适用；优秀者首年可破50万）",
    salarySource: {"level": "E3", "name": "南昌大学就业信息网奥克斯校招", "url": "https://jy.ncu.edu.cn/detail/job?id=2584696", "retrievalDate": "2026-09-17"},
    recruitmentProcess: "网申→笔试→AI测评→专面→offer",
    processSource: {"level": "E2", "name": "西安理工大学就业信息网奥克斯校招", "url": "https://job.xaut.edu.cn/info/1091/6133.htm", "retrievalDate": "2026-09-17"},
    writtenTest: "有（在线笔试+AI测评）",
    testSource: {"level": "E2", "name": "西安理工大学就业信息网奥克斯校招", "url": "https://job.xaut.edu.cn/info/1091/6133.htm", "retrievalDate": "2026-09-17"}
  },
  {
    company: "搜狐畅游", 
    salary: "全年14-16薪（具体月薪未公布；公司整体）",
    salarySource: {"level": "E2", "name": "厦门大学嘉庚学院就业网", "url": "https://career.xujc.com/2026/0824/c3959a172354/page.htm", "retrievalDate": "2026-09-17"},
    recruitmentProcess: "网申→笔试（少部分岗位）→2-3轮面试→Offer→签约→入职",
    processSource: {"level": "E1", "name": "畅游校招官网流程", "url": "http://campus.changyou.com/recruitment/process.shtml", "retrievalDate": "2026-09-17"},
    writtenTest: "有（仅部分岗位设笔试，暂无统一笔试；以邮件通知为准）",
    testSource: {"level": "E1", "name": "畅游校招官网FAQ", "url": "https://campus.changyou.com/help/question.shtml", "retrievalDate": "2026-09-17"}
  },
  {
    company: "小红书", 
    salary: "9.5K-14.5K/月（rednote全球内容运营岗，主表JD）",
    salarySource: {"level": "E2", "name": "主表JD薪资", "url": "https://job.neu.edu.cn/campus/view/id/562149", "retrievalDate": "2026-09-17"},
    recruitmentProcess: "网申/内推→笔试→面试→Offer",
    processSource: {"level": "E2", "name": "今日头条校招报道", "url": "http://m.toutiao.com/group/7683117729359921727/", "retrievalDate": "2026-09-17"},
    writtenTest: "有（在线笔试；部分非技术岗重点考察AI应用能力）",
    testSource: {"level": "E4", "name": "抖音校招笔试攻略", "url": "https://www.iesdouyin.com/share/video/7684619060755501684", "retrievalDate": "2026-09-17"}
  },
  {
    company: "傲基科技（Aukey）", 
    salary: "7.5K-12.5K/月（校招管培生，13-14薪+额外激励；优秀者首年可突破50万）",
    salarySource: {"level": "E3", "name": "哈尔滨理工大学就业网校招公告", "url": "https://jiuye.hrbust.edu.cn/preaching/index.jhtml?id=168633&isOutsideSchool=1", "retrievalDate": "2026-09-17"},
    recruitmentProcess: "网申→笔试→AI测评→专业面试(初面/复面)→Offer→入职",
    processSource: {"level": "E3", "name": "哈尔滨理工大学/湖南科技大学就业网校招公告", "url": "https://jiuye.hrbust.edu.cn/preaching/index.jhtml?id=168633&isOutsideSchool=1", "retrievalDate": "2026-09-17"},
    writtenTest: "有（线上笔试+AI测评）",
    testSource: {"level": "E3", "name": "哈尔滨理工大学就业网校招公告", "url": "https://jiuye.hrbust.edu.cn/preaching/index.jhtml?id=168633&isOutsideSchool=1", "retrievalDate": "2026-09-17"}
  },
  {
    company: "德赛西威", 
    salary: "10K-15K/月（公司整体校招岗，制造供应链类/软件类口径；HR/传媒公关/流程运营类岗适用）",
    salarySource: {"level": "E3", "name": "广州应用科技学院就业网德赛西威校招", "url": "https://gykyjy.gzasc.edu.cn/detail/career?id=694582", "retrievalDate": "2026-09-17"},
    recruitmentProcess: "网申→在线测评→（部分岗位笔试/AI面试）→面试（一般1轮线上面试，部分岗位复试）→offer",
    processSource: {"level": "E2", "name": "超级简历德赛西威2027校招解读", "url": "https://www.chaojijianli.com/xiaozhao/desay-sv-2027-global-campus-recruitment-14528-e82811/", "retrievalDate": "2026-09-17"},
    writtenTest: "有（在线测评必做+部分岗位笔试/AI面试）",
    testSource: {"level": "E2", "name": "超级简历德赛西威2027校招解读", "url": "https://www.chaojijianli.com/xiaozhao/desay-sv-2027-global-campus-recruitment-14528-e82811/", "retrievalDate": "2026-09-17"}
  },
  {
    company: "荣耀", 
    salary: "面议/未公布（官方校招简章未公布具体薪资区间；营销创意管培生/AI产品运营经理等岗未单独披露）",
    salarySource: {"level": "E2", "name": "浙江大学就业服务平台荣耀校招", "url": "https://www.career.zju.edu.cn/jyxt/sczp/zpztgl/ckZpgwXq.zf?zpxxbh=59C5E8F54A0D6C33E0653A68DD0E9B18", "retrievalDate": "2026-09-17"},
    recruitmentProcess: "非研发类（设计除外）：网申→集体面试→业务面试→综合测评→综合面试→录用（部分岗位需语言测评）",
    processSource: {"level": "E2", "name": "哈尔滨工业大学(威海)就业网荣耀校招", "url": "https://job.hitwh.edu.cn/zhxy-whxszyfzpt/zpxx/zczphxq?id=ZjExZGJmNTdmN2ZiNGUyNzgxMzZiYTBmMGE3YTUzYmY=", "retrievalDate": "2026-09-17"},
    writtenTest: "有（综合测评必做；部分岗位语言测评；非研发类无单独机考笔试，研发类有机考）",
    testSource: {"level": "E2", "name": "浙江大学就业服务平台荣耀校招", "url": "https://www.career.zju.edu.cn/jyxt/sczp/zpztgl/ckZpgwXq.zf?zpxxbh=59C5E8F54A0D6C33E0653A68DD0E9B18", "retrievalDate": "2026-09-17"}
  },
  {
    company: "宝洁（P&G）", 
    salary: "面议/未公布（官方称“有竞争力起薪，根据表现定期涨薪”；HR Manager岗）",
    salarySource: {"level": "E3", "name": "清华大学就业网校招公告", "url": "https://career.cic.tsinghua.edu.cn/xsglxt/f/jyxt/anony/showZwxx?zpxxid=561473968", "retrievalDate": "2026-09-17"},
    recruitmentProcess: "网申及在线测评→两轮面试(9月起，无群面，全程视频面试)→Offer发放(10月起)",
    processSource: {"level": "E3", "name": "清华大学就业网校招公告", "url": "https://career.cic.tsinghua.edu.cn/xsglxt/f/jyxt/anony/showZwxx?zpxxid=561473968", "retrievalDate": "2026-09-17"},
    writtenTest: "有（在线测评：Aon怡安游戏化认知能力测评+成功驱动力性格问卷，约1小时）",
    testSource: {"level": "E2", "name": "宝洁中国招聘官网招聘流程", "url": "https://careers.pg.com.cn/cn/zh/hiring-process", "retrievalDate": "2026-09-17"}
  },
  {
    company: "绿盟科技", 
    salary: "面议/未公布（官方称\"按地区划分，面试时详细了解\"；2026届参考综合年薪14-35万，2027届未公布具体区间；市场管培生岗未单独披露）",
    salarySource: {"level": "E1", "name": "绿盟科技官方校招FAQ", "url": "https://www.nsfocus.com.cn/campus/1_1.html", "retrievalDate": "2026-09-17"},
    recruitmentProcess: "网申投递（7月28日-11月中旬）→在线笔试（8月下旬起）→面试（9月上旬-11月底）→Offer发放（10月上旬起）→签约",
    processSource: {"level": "E2", "name": "西北工业大学就业网绿盟科技2027校招", "url": "https://jobszqy.nwpu.edu.cn/frontpage/mobile/dist/index.html?BPefdvysv0gY=1789343854225#/recruitmentinfoForm?positionDetailId=4e058906f9474eaa8de8e06743869913&", "retrievalDate": "2026-09-17"},
    writtenTest: "有（在线笔试）",
    testSource: {"level": "E1", "name": "绿盟科技官方校招页", "url": "https://www.nsfocus.com.cn/campus/1_1.html", "retrievalDate": "2026-09-17"}
  },
  {
    company: "宝宝巴士", 
    salary: "约9K/月（月薪级别9000，公司整体）",
    salarySource: {"level": "E2", "name": "上海外国语大学就业网", "url": "https://career.shisu.edu.cn/position.html?jobtype=2&wid=26083116533805828487", "retrievalDate": "2026-09-17"},
    recruitmentProcess: "网申/内推→笔试/测评→1-2轮面试→Offer",
    processSource: {"level": "E1", "name": "宝宝巴士校招官网", "url": "https://babybus.zhiye.com/campus", "retrievalDate": "2026-09-17"},
    writtenTest: "有（线上笔试/测评；所有校招岗位均安排综合能力测评）",
    testSource: {"level": "E1", "name": "宝宝巴士校招官网FAQ", "url": "https://babybus.zhiye.com/campus", "retrievalDate": "2026-09-17"}
  },
  {
    company: "正浩创新EcoFlow", 
    salary: "15K-30K/月（技术岗口径，深圳/西安/苏州；HR/电商/招聘交付助理等非技术岗未单独公布，官方称\"有竞争力薪酬\"）",
    salarySource: {"level": "E3", "name": "华南理工大学就业指导中心正浩创新校招", "url": "https://jyzx.scut.edu.cn/zwxq/list.htm?id=d53a296ab8ec49a89838f3b37e02ec92", "retrievalDate": "2026-09-17"},
    recruitmentProcess: "简历投递→综合素质测评→线上笔试/AI语言面试（部分岗位）→业务一面（部分无领导小组讨论）→业务二面→业务终面及HRBP面→录用谈薪→Offer→三方→入职",
    processSource: {"level": "E2", "name": "清华大学就业网正浩创新2027秋招", "url": "https://career.cic.tsinghua.edu.cn/xsglxt/f/jyxt/anony/showZwxxForWx?zpxxid=563738243", "retrievalDate": "2026-09-17"},
    writtenTest: "有（综合素质测评+部分岗位线上笔试/AI语言面试）",
    testSource: {"level": "E2", "name": "清华大学就业网正浩创新2027秋招", "url": "https://career.cic.tsinghua.edu.cn/xsglxt/f/jyxt/anony/showZwxxForWx?zpxxid=563738243", "retrievalDate": "2026-09-17"}
  },
  {
    company: "名创优品（MINISO）", 
    salary: "海外运营/项目管理创优生 10W-14W/年；国内运营创优生 9W-11W/年；TOP TOY门店运营管培生 7K-9K/月",
    salarySource: {"level": "E2", "name": "官方校招JD（主表岗位数据）", "url": "https://miniso.zhiye.com/Campus", "retrievalDate": "2026-09-17"},
    recruitmentProcess: "网申→线上测评→AI面试→初试→复试→终试→发放Offer",
    processSource: {"level": "E2", "name": "名创优品校招官网", "url": "https://miniso.zhiye.com/Campus", "retrievalDate": "2026-09-17；E3"},
    writtenTest: "有（线上测评+AI面试）",
    testSource: {"level": "E2", "name": "名创优品校招官网", "url": "https://miniso.zhiye.com/Campus", "retrievalDate": "2026-09-17"}
  },
  {
    company: "达能（Danone）", 
    salary: "15K-20K/月（2027达能管培生岗，市场营销/商务等方向）",
    salarySource: {"level": "E3", "name": "南开大学就业网校招公告", "url": "https://career.nankai.edu.cn/correcruit/content/id/118101.html", "retrievalDate": "2026-09-17"},
    recruitmentProcess: "简历投递与筛选(9/7-10/31)→AI面试→评估中心面试AC(10-11月中)→终面Leadership Interview(10-11月)→Offer(10-11月)",
    processSource: {"level": "E2", "name": "达能校招官网", "url": "https://careersite.danone.com.cn/zh_CN/careers/Campus/index.html", "retrievalDate": "2026-09-17"},
    writtenTest: "有（AI面试+在线评估）",
    testSource: {"level": "E2", "name": "达能校招官网", "url": "https://careersite.danone.com.cn/zh_CN/careers/Campus/index.html", "retrievalDate": "2026-09-17"}
  },
  {
    company: "货拉拉", 
    salary: "全球拓展管培生年薪36-50w（月薪约2.8-3万）",
    salarySource: {"level": "E2", "name": "主表JD+智联JD", "url": "https://m.zhaopin.com/jobs/CC639587180J40596829703.htm", "retrievalDate": "2026-09-17"},
    recruitmentProcess: "网申/内推→测评→在线笔试→AI面试→HR沟通→线上初面→终面→发放offer",
    processSource: {"level": "E2", "name": "官方校招门户", "url": "https://huolala.zhiye.com/Campus", "retrievalDate": "2026-09-17"},
    writtenTest: "有（在线笔试+AI测评）",
    testSource: {"level": "E2", "name": "官方校招门户", "url": "https://huolala.zhiye.com/Campus", "retrievalDate": "2026-09-17"}
  },
  {
    company: "京东方", 
    salary: "面议/未公布（官方称\"根据面试评价与具体职位差异化定薪\"，未公布具体区间；HR专员岗未单独披露）",
    salarySource: {"level": "E2", "name": "北京航空航天大学就业资讯网京东方校招", "url": "https://career.buaa.edu.cn/frontpage/buaa/html/recruitmentinfoForm.html?positionDetailId=b6337a78e2af4fee9c0a53012a780b37", "retrievalDate": "2026-09-17"},
    recruitmentProcess: "简历投递→在线测评→（部分岗位AI面试）→面试→签约→体检→入职",
    processSource: {"level": "E2", "name": "吉林大学就业网京东方2027校招", "url": "https://jdjyw.jlu.edu.cn/portal/jyzp/recruit/details?id=ff28a962b62d4eddaf1d68767e0c054d", "retrievalDate": "2026-09-17"},
    writtenTest: "有（在线测评必做+部分岗位AI面试）",
    testSource: {"level": "E2", "name": "吉林大学就业网京东方2027校招", "url": "https://jdjyw.jlu.edu.cn/portal/jyzp/recruit/details?id=ff28a962b62d4eddaf1d68767e0c054d", "retrievalDate": "2026-09-17"}
  },
  {
    company: "杭州宇树科技股份有限公司", 
    salary: "人力资源专员6K-8K/月（HR岗JD薪资）；销售专员约11K-20K/月（二手面经）；整体校招技术岗可达15K-50K/月",
    salarySource: {"level": "E2", "name": "主表JD数据+抖音面经二手来源", "url": "https://www.iesdouyin.com/share/video/7663727653917032107", "retrievalDate": "2026-09-17"},
    recruitmentProcess: "在线网申→笔试/面试→综合测评→Offer",
    processSource: {"level": "E3", "name": "牛企直聘宇树科技2027校招", "url": "https://campus.niuqizp.com/job-vyk5zNLNt.html", "retrievalDate": "2026-09-17"},
    writtenTest: "有（笔试+综合测评/性格测评）",
    testSource: {"level": "E3", "name": "牛企直聘宇树科技2027校招", "url": "https://campus.niuqizp.com/job-vyk5zNLNt.html", "retrievalDate": "2026-09-17"}
  },
  {
    company: "金山软件", 
    salary: "产品运营14-17K/月（27届校招JD）",
    salarySource: {"level": "E3", "name": "猎聘校招JD", "url": "https://www.liepin.com/job/1985011735.shtml", "retrievalDate": "2026-09-17"},
    recruitmentProcess: "网申→线上笔试/测评→面试→Offer",
    processSource: {"level": "E2", "name": "中国农业大学就业网校招公告", "url": "https://scc.cau.edu.cn/frontpage/cau/html/recruitmentinfoForm.html?positionDetailId=4e1be63de7e94f7f8c21bb42eeab45bf", "retrievalDate": "2026-09-17"},
    writtenTest: "有（线上笔试/测评）",
    testSource: {"level": "E4", "name": "牛客网校招讨论", "url": "https://m.nowcoder.com/discuss/comment/12638390", "retrievalDate": "2026-09-17"}
  },
  {
    company: "微步在线", 
    salary: "本科18W起，硕士20W起（公司整体，二手来源）",
    salarySource: {"level": "E4", "name": "牛客网校招帖", "url": "https://www.nowcoder.com/feed/main/detail/1ddb2aae5143479d8b19016b362be9d6", "retrievalDate": "2026-09-17"},
    recruitmentProcess: "网申→笔试/综合能力测评→多轮专业面试→综合评估→Offer",
    processSource: {"level": "E4", "name": "超级简历校招页", "url": "https://www.wondercv.com/xiaozhao/weibu-online-campus-recruitment-2027-11446-4b7471/", "retrievalDate": "2026-09-17"},
    writtenTest: "有（技术/综合能力测评）",
    testSource: {"level": "E4", "name": "超级简历校招页", "url": "https://www.wondercv.com/xiaozhao/weibu-online-campus-recruitment-2027-11446-4b7471/", "retrievalDate": "2026-09-17"}
  },
  {
    company: "岚图汽车", 
    salary: "12K-18K/月（供应链管理/用户服务运营/后市场运营岗JD薪资）",
    salarySource: {"level": "E2", "name": "主表JD数据（岚图校招JD）", "url": "https://app.mokahr.com/campus-recruitment/voyah/146293", "retrievalDate": "2026-09-17"},
    recruitmentProcess: "投递简历→测评/AI面试→业务面试→offer签约",
    processSource: {"level": "E2", "name": "吉林大学就业网岚图汽车2027校招", "url": "https://jdjyw.jlu.edu.cn/portal/recruit/details?id=3dc3bb065021448ea7946ac0fb8c54a7", "retrievalDate": "2026-09-17"},
    writtenTest: "有（在线测评/AI面试）",
    testSource: {"level": "E2", "name": "吉林大学就业网岚图汽车2027校招", "url": "https://jdjyw.jlu.edu.cn/portal/recruit/details?id=3dc3bb065021448ea7946ac0fb8c54a7", "retrievalDate": "2026-09-17"}
  },
  {
    company: "拓邦股份", 
    salary: "面议/未公布（公开薪资以技术岗为主：电气工程师10.5K-15K、电源开发15K+、AI算法硕士20K-26K；市场专员/营销经理/人力资源专员等非技术岗未单独披露）",
    salarySource: {"level": "E3", "name": "西安电子科技大学就业网拓邦校招", "url": "https://job.xidian.edu.cn/teachin/view/id/124361", "retrievalDate": "2026-09-17"},
    recruitmentProcess: "网申→简历初筛→初试→复试→Offer发放→签订三方协议",
    processSource: {"level": "E2", "name": "西安电子科技大学就业网拓邦2027校招", "url": "https://job.xidian.edu.cn/campus/view/id/757073", "retrievalDate": "2026-09-17"},
    writtenTest: "无（官方流程中未提及笔试/测评环节，以面试为主）",
    testSource: {"level": "E2", "name": "西安电子科技大学就业网拓邦2027校招", "url": "https://job.xidian.edu.cn/campus/view/id/757073", "retrievalDate": "2026-09-17"}
  },
  {
    company: "三七互娱", 
    salary: "职能类18-35万/年；策划/市场运营类25-50万/年（公司整体）",
    salarySource: {"level": "E4", "name": "新浪财经校招薪酬分析", "url": "https://finance.sina.com.cn/stock/relnews/cn/2026-05-19/doc-inhymivh3290503.shtml", "retrievalDate": "2026-09-17"},
    recruitmentProcess: "网申/内推→人才测评→专业笔试→面试→Offer",
    processSource: {"level": "E1", "name": "三七互娱校招官网FAQ", "url": "https://zhaopin.37.com/index.php?m=Home&c=campus&a=qa", "retrievalDate": "2026-09-17"},
    writtenTest: "有（人才测评必做+部分岗位专业笔试/AI面试）",
    testSource: {"level": "E1", "name": "三七互娱校招官网FAQ", "url": "https://zhaopin.37.com/index.php?m=Home&c=campus&a=qa", "retrievalDate": "2026-09-17"}
  },
  {
    company: "Shopee", 
    salary: "非技术岗面议/未公布；技术岗40-50K×15薪",
    salarySource: {"level": "E4", "name": "牛客网校招JD", "url": "https://www.nowcoder.com/jobs/hr/7972", "retrievalDate": "2026-09-17"},
    recruitmentProcess: "网申/内推→笔试→2-3轮专业面试→HR沟通→Offer",
    processSource: {"level": "E2", "name": "华南理工就业网校招公告", "url": "https://jyzx.scut.edu.cn/zwxq/list.htm?id=4c58e18b14364ac58c6726f03fd6d0c6", "retrievalDate": "2026-09-17"},
    writtenTest: "有（在线笔试；研发类部分岗位为AI Coding，产品类初面为群面）",
    testSource: {"level": "E2", "name": "厦门大学校招公告", "url": "https://jy.xmu.edu.cn/campus/view/id/1001830", "retrievalDate": "2026-09-17"}
  },
  {
    company: "吉利汽车", 
    salary: "8K-13K/月（综合岗/区域营销岗/运营岗口径；实习期4.5K-6K，转正后8K+）",
    salarySource: {"level": "E3", "name": "暨南大学就业信息网吉利校招", "url": "https://scdc.jnu.edu.cn/campus/view/id/1036195", "retrievalDate": "2026-09-17"},
    recruitmentProcess: "网申/内推（8月13日-10月31日）→在线测评/AI面试→面试（8月31日-10月31日）→Offer发放（9月7日-11月6日）",
    processSource: {"level": "E2", "name": "浙江大学就业服务平台吉利校招", "url": "https://www.career.zju.edu.cn/jyxt/sczp/zpztgl/ckZpgwXq.zf?zpxxbh=59110359F84C63E3E0653A68DD0E9B18", "retrievalDate": "2026-09-17"},
    writtenTest: "有（在线测评+AI面试）",
    testSource: {"level": "E2", "name": "浙江大学就业服务平台吉利校招", "url": "https://www.career.zju.edu.cn/jyxt/sczp/zpztgl/ckZpgwXq.zf?zpxxbh=59110359F84C63E3E0653A68DD0E9B18", "retrievalDate": "2026-09-17"}
  },
  {
    company: "洲明科技", 
    salary: "综合年薪19W-40W（公司整体口径；基本薪资+绩效奖金+年终奖；市场专员/运营专员岗未单独公布，技术岗约12K-22K/月）",
    salarySource: {"level": "E2", "name": "哈尔滨工业大学就业网洲明科技校招", "url": "https://career.hit.edu.cn/zhxy-xszyfzpt/zpxx/zczphxq?id=ZDNiMzQzMTE5MzhhNDQyNGFlNDA2YWUxOTQ2NzI1NDQ=", "retrievalDate": "2026-09-17"},
    recruitmentProcess: "线上网申→简历初筛→笔试→面试→测评→offer→三方",
    processSource: {"level": "E2", "name": "西安电子科技大学就业网洲明科技校招", "url": "https://job.xidian.edu.cn/teachin/view/id/125552", "retrievalDate": "2026-09-17"},
    writtenTest: "有（笔试+测评）",
    testSource: {"level": "E2", "name": "西安电子科技大学就业网洲明科技校招", "url": "https://job.xidian.edu.cn/teachin/view/id/125552", "retrievalDate": "2026-09-17"}
  },
  {
    company: "影石Insta360", 
    salary: "面议/未公布（官方称\"平均不低于14薪+年度2次调薪\"，具体区间未公布；海外公关/雇主品牌/运动营销管培生岗未单独披露）",
    salarySource: {"level": "E3", "name": "猎聘影石2027校招采购管培生JD", "url": "https://www.liepin.com/job/1984325263.shtml", "retrievalDate": "2026-09-17"},
    recruitmentProcess: "网申→简历筛选→线上笔试/测评→面试→Offer发放",
    processSource: {"level": "E3", "name": "牛企直聘影石2027校招UP计划", "url": "https://campus.niuqizp.com/job-vUU5ZtLtn.html", "retrievalDate": "2026-09-17"},
    writtenTest: "有（线上笔试/测评）",
    testSource: {"level": "E3", "name": "牛客网影石Insta360海外销售面经", "url": "https://m.nowcoder.com/discuss/353157233552859136", "retrievalDate": "2026-09-17"}
  },
  {
    company: "中兴通讯", 
    salary: "面议/未公布（官方未公布2027校招具体薪资区间；品牌经理/人力资源经理-海外等岗未单独披露；蓝剑SSP有特殊起薪）",
    salarySource: {"level": "E1", "name": "中兴通讯官方招聘网站", "url": "https://job.zte.com.cn/cn/index.html", "retrievalDate": "2026-09-17"},
    recruitmentProcess: "网申→综合测评（所有岗位）→岗位笔试（部分岗位）→专业面试→综合面试→终试洽谈→签约",
    processSource: {"level": "E1", "name": "中兴通讯官方校招流程页", "url": "https://job.zte.com.cn/cn/campus-recruitment/School_Recruitment_Announcement/process.html", "retrievalDate": "2026-09-17"},
    writtenTest: "有（综合测评所有岗位必做+部分岗位笔试；综合面试考察英语口语）",
    testSource: {"level": "E1", "name": "中兴通讯官方校招FAQ", "url": "https://job.zte.com.cn/cn/campus-recruitment/faq.html/", "retrievalDate": "2026-09-17"}
  },
  {
    company: "万向集团", 
    salary: "综合类岗8K-10K/月（杭州）；应届生约10-12.5K/月（公司整体口径）",
    salarySource: {"level": "E2", "name": "太原理工就业网职位页+职友集", "url": "https://mobile.tyut.edu.cn/myjob/delivery_one.html?id=0d9d783f-af11-7e5b-791b-3723969277fc", "retrievalDate": "2026-09-17"},
    recruitmentProcess: "网申提交简历→参加校园宣讲会→初试→复试（线上/线下）→职业测评→签订就业协议书",
    processSource: {"level": "E2", "name": "官方校招简章（南开大学就业网）", "url": "https://career.nankai.edu.cn/correcruit/content/id/118098.html", "retrievalDate": "2026-09-17"},
    writtenTest: "有（职业测评）",
    testSource: {"level": "E2", "name": "官方校招简章", "url": "https://career.nankai.edu.cn/correcruit/content/id/118098.html", "retrievalDate": "2026-09-17"}
  },
  {
    company: "国贸股份", 
    salary: "贸易运营岗14-16万/年、海外业务岗14-18万/年",
    salarySource: {"level": "E2", "name": "主表JD薪资", "url": "2026-09-17", "retrievalDate": "2026-09-17"},
    recruitmentProcess: "网申→线上测试→初试→复试→发放offer→体检→签订三方协议→入职",
    processSource: {"level": "E2", "name": "官方校招简章（南开大学就业网）", "url": "https://career.nankai.edu.cn/correcruit/content/id/117204.html", "retrievalDate": "2026-09-17"},
    writtenTest: "有（线上测试/测评）",
    testSource: {"level": "E2", "name": "官方校招简章", "url": "https://career.nankai.edu.cn/correcruit/content/id/117204.html", "retrievalDate": "2026-09-17"}
  },
  {
    company: "零跑汽车", 
    salary: "15K-20K/月（公司整体校招口径；岗位工资+年终奖+项目奖金+专利奖金+核心岗位股权激励；国际物流/运营管理工程师岗适用）",
    salarySource: {"level": "E3", "name": "南开大学就业指导中心零跑汽车校招", "url": "https://career.nankai.edu.cn/correcruit/content/id/118195.html", "retrievalDate": "2026-09-17"},
    recruitmentProcess: "网申/内推→测评/笔试（以岗位需求为准）→面试（初复试）→OFFER/三方（10月开启）",
    processSource: {"level": "E2", "name": "零跑汽车官方校招门户", "url": "https://leapmotor.zhiye.com/campus", "retrievalDate": "2026-09-17"},
    writtenTest: "有（在线测评/笔试，以岗位需求为准，在线形式滚动发放）",
    testSource: {"level": "E1", "name": "零跑汽车官方校招Q&A", "url": "https://leapmotor.zhiye.com/intern", "retrievalDate": "2026-09-17"}
  },
  {
    company: "追觅科技", 
    salary: "8K-15K/月（TikTok运营-达人营销岗JD薪资；HRBP岗未单独公布；公司整体12个月基本工资+3-6个月绩效奖金）",
    salarySource: {"level": "E2", "name": "主表JD数据（追觅校招JD J48210）", "url": "https://dreame.zhiye.com/campus/jobs", "retrievalDate": "2026-09-17"},
    recruitmentProcess: "网申（7月1日起）→在线测评（网申后自动触发）→面试（2-3轮）→Offer（9月起陆续发放）",
    processSource: {"level": "E1", "name": "追觅科技官方校招门户", "url": "https://dreame.zhiye.com/Campus", "retrievalDate": "2026-09-17"},
    writtenTest: "有（在线测评，网申后自动触发）",
    testSource: {"level": "E1", "name": "追觅科技官方校招门户", "url": "https://dreame.zhiye.com/Campus", "retrievalDate": "2026-09-17"}
  },
  {
    company: "福耀玻璃", 
    salary: "人力资源/商务销售岗8K-10K/月（福州）；市场营销岗6.5-7.5K/月",
    salarySource: {"level": "E2", "name": "官方校招简章（郑州轻工业大学就业网）", "url": "http://job.zzuli.edu.cn/module/campustalkdetail/id-6a9e101f713d9a397a2e5ed7/nid-1670/page-2", "retrievalDate": "2026-09-17"},
    recruitmentProcess: "关注福耀集团招聘公众号→网上投递简历→面试→offer签约→录用报到",
    processSource: {"level": "E2", "name": "官方校招简章（厦门大学管理学院）", "url": "https://smcareer.xmu.edu.cn/info/1008/31515.htm", "retrievalDate": "2026-09-17"},
    writtenTest: "无（流程未提及笔试/测评）",
    testSource: {"level": "E2", "name": "官方校招简章", "url": "https://smcareer.xmu.edu.cn/info/1008/31515.htm", "retrievalDate": "2026-09-17"}
  },
  {
    company: "中信科移动", 
    salary: "市场经理（海外）10K-15K/月、市场经理15K-25K/月",
    salarySource: {"level": "E2", "name": "主表JD薪资", "url": "2026-09-17", "retrievalDate": "2026-09-17"},
    recruitmentProcess: "网申→简历筛选→线上笔试→线上初面→线下复试→线上性格测评→体检→录用签约",
    processSource: {"level": "E2", "name": "官方校招FAQ", "url": "https://portal-oss.zhiye.com/104294/resource/83fd87fc-6317-400b-8682-e0f6ba8a91c4.html", "retrievalDate": "2026-09-17"},
    writtenTest: "有（线上笔试：综合能力+性格测试）",
    testSource: {"level": "E2", "name": "官方校招FAQ", "url": "https://portal-oss.zhiye.com/104294/resource/83fd87fc-6317-400b-8682-e0f6ba8a91c4.html", "retrievalDate": "2026-09-17"}
  },
  {
    company: "盛趣游戏", 
    salary: "面议/未公布（校招岗位多标注“面议”）",
    salarySource: {"level": "E4", "name": "国家大学生就业服务平台/牛客校招JD", "url": "https://www.ncss.cn/student/m/jobs/2RVQZBNeA56KWdPqMdoAkq/detail.html", "retrievalDate": "2026-09-17"},
    recruitmentProcess: "网申(8/3启动)→线上笔试(8/29-30第一批)→线上初面→线下复试→HR面(9月底-10月上)→意向沟通/Offer(10月中下旬)",
    processSource: {"level": "E4", "name": "牛客网校招日程", "url": "https://www.nowcoder.com/feed/main/detail/5cd83b95bbf24ad08aa32a51385252e4", "retrievalDate": "2026-09-17；E3"},
    writtenTest: "有（线上笔试：综合能力+性格测试；复试后另有线上性格测评）",
    testSource: {"level": "E3", "name": "官方校招FAQ文档", "url": "https://portal-oss.zhiye.com/104294/resource/83fd87fc-6317-400b-8682-e0f6ba8a91c4.html", "retrievalDate": "2026-09-17"}
  },
  {
    company: "星源材质", 
    salary: "本科8-15万/年，硕士12-25万/年（公司整体口径，技术岗为主）",
    salarySource: {"level": "E2", "name": "官方校招简章（合肥工业大学就业网）", "url": "https://ahjzu.ahbys.com/nw/company.html?cid=23644", "retrievalDate": "2026-09-17"},
    recruitmentProcess: "简历投递→简历筛选→HR面试→人才测评→专业面试→录用审批→offer",
    processSource: {"level": "E2", "name": "官方校招简章（华中科技大学就业网）", "url": "http://job.hust.edu.cn/zpinfo1/2411163.htm", "retrievalDate": "2026-09-17"},
    writtenTest: "有（人才测评）",
    testSource: {"level": "E2", "name": "官方校招简章", "url": "http://job.hust.edu.cn/zpinfo1/2411163.htm", "retrievalDate": "2026-09-17"}
  },
  {
    company: "锐明技术", 
    salary: "产品市场工程师15K-22K/月",
    salarySource: {"level": "E2", "name": "主表JD薪资", "url": "2026-09-17", "retrievalDate": "2026-09-17"},
    recruitmentProcess: "网申→简历筛选→在线测评→面试→签约",
    processSource: {"level": "E2", "name": "官方校招简章（东北大学就业网）", "url": "http://job.neu.edu.cn/campus/view/id/562885", "retrievalDate": "2026-09-17"},
    writtenTest: "有（在线测评）",
    testSource: {"level": "E2", "name": "官方校招简章", "url": "http://job.neu.edu.cn/campus/view/id/562885", "retrievalDate": "2026-09-17"}
  },
  {
    company: "优衣库（UNIQLO）", 
    salary: "税前月薪11200-14800元（UMC经营管理培训生，需接受全国调动）",
    salarySource: {"level": "E4", "name": "智联招聘官方JD", "url": "https://m.zhaopin.com/jobs/CC153740610J40929877712.htm", "retrievalDate": "2026-09-17；E3"},
    recruitmentProcess: "网申→AI测评→直播宣讲会→线上一面→线下二面→线下终面→店铺实践工时确认(≥80小时)→Offer",
    processSource: {"level": "E3", "name": "西安邮电/韩山师范就业网校招公告", "url": "http://jiuye.xupt.edu.cn/detail/job?id=3242306", "retrievalDate": "2026-09-17"},
    writtenTest: "有（AI测评/在线能力测试）",
    testSource: {"level": "E3", "name": "西安邮电就业网校招公告", "url": "http://jiuye.xupt.edu.cn/detail/job?id=3242306", "retrievalDate": "2026-09-17"}
  },
  {
    company: "锐捷网络", 
    salary: "市场类本科年薪16.8w起最高30w，硕士19.2w起最高30w（往年参考）；销售经理10.5K-15K/月",
    salarySource: {"level": "E2", "name": "官方校招简章（厦门大学就业网）", "url": "https://jy.xmu.edu.cn/campus/view/id/1000295", "retrievalDate": "2026-09-17"},
    recruitmentProcess: "简历投递→简历初筛→测评→AI面试(部分岗位)→AI笔试→面试(2轮)→offer",
    processSource: {"level": "E2", "name": "官方校招简章（南开大学就业网）", "url": "https://career.nankai.edu.cn/correcruit/content/id/117593.html", "retrievalDate": "2026-09-17"},
    writtenTest: "有（测评+AI笔试+AI面试部分岗位）",
    testSource: {"level": "E2", "name": "官方校招简章", "url": "https://career.nankai.edu.cn/correcruit/content/id/117593.html", "retrievalDate": "2026-09-17"}
  },
  {
    company: "金发科技", 
    salary: "内部运营类本科17万/年；技术支持类本科15.6-17.4万/年（公司整体口径，往年参考）",
    salarySource: {"level": "E2", "name": "中国科大就业网职位表", "url": "http://www.job.ustc.edu.cn/Specialrecruitment/info.aspx?itemid=9497", "retrievalDate": "2026-09-17"},
    recruitmentProcess: "简历投递→简历筛选→在线测评→面试评估（初/复/终试）→Offer签约",
    processSource: {"level": "E2", "name": "官方校招页", "url": "https://kingfa.zhiye.com/campus", "retrievalDate": "2026-09-17"},
    writtenTest: "有（在线测评）",
    testSource: {"level": "E2", "name": "官方校招页", "url": "https://kingfa.zhiye.com/campus", "retrievalDate": "2026-09-17"}
  },
  {
    company: "极兔速递", 
    salary: "管培生14-35万/年（上海及海外）；物流营运类管培生9K-14K/月",
    salarySource: {"level": "E2", "name": "官方校招简章（华东交通大学就业网）", "url": "https://jxdxsjy.jx.edu.cn/ecjtu/teachin/view/id/203381", "retrievalDate": "2026-09-17"},
    recruitmentProcess: "简历投递→初筛→初试→测评→复试→offer",
    processSource: {"level": "E2", "name": "官方校招简章（西安邮电大学就业网）", "url": "http://jiuye.xupt.edu.cn/detail/job?id=3047769", "retrievalDate": "2026-09-17"},
    writtenTest: "有（人才测评；笔试仅限产品研发类岗位）",
    testSource: {"level": "E2", "name": "官方校招简章", "url": "https://www.wondercv.com/xiaozhao/jtexpress-2027-global-campus-recruitment-14307-e6a728/", "retrievalDate": "2026-09-17"}
  },
  {
    company: "奥马冰箱", 
    salary: "综合年薪10-25万起；管培生10K-15K/月",
    salarySource: {"level": "E2", "name": "官方校招简章（深圳北理莫斯科大学就业网）", "url": "https://career.smbu.edu.cn/detail/online?id=3575846", "retrievalDate": "2026-09-17"},
    recruitmentProcess: "网申/内推→AI面试→复试→测评→发放offer→录用签约",
    processSource: {"level": "E2", "name": "官方校招简章（湖南科技大学就业网）", "url": "https://jy.hnust.edu.cn/detail/career?id=657803", "retrievalDate": "2026-09-17"},
    writtenTest: "有（AI面试+测评）",
    testSource: {"level": "E2", "name": "官方校招简章", "url": "https://jy.hnust.edu.cn/detail/career?id=657803", "retrievalDate": "2026-09-17"}
  },
  {
    company: "华勤技术", 
    salary: "本科15-20万/年，硕士20-26万/年（15薪，公司整体口径）",
    salarySource: {"level": "E2", "name": "官方校招简章（抖音官方号转载）", "url": "https://www.iesdouyin.com/share/video/7678200691814749083", "retrievalDate": "2026-09-17"},
    recruitmentProcess: "网申+测评→2-3轮面试→发放意向书→offer发放与签约",
    processSource: {"level": "E2", "name": "官方校招简章（安徽大学生就业平台）", "url": "https://24365.ah.smartedu.cn/job2.html?cid=7455&jid=11571", "retrievalDate": "2026-09-17"},
    writtenTest: "有（线上测评：行测+性格测试；研发岗另有线上笔试）",
    testSource: {"level": "E2", "name": "官方校招FAQ（Moka）", "url": "https://app.mokahr.com/m/campus-recruitment/hq/44757", "retrievalDate": "2026-09-17"}
  },
  {
    company: "蓝思科技", 
    salary: "工程技术类10K-15K/月；校招整体「行业领先薪资，优秀者不设上限」（非技术岗未单独公布）",
    salarySource: {"level": "E2", "name": "官方校招简章（南华大学就业网）", "url": "https://jiuye.usc.edu.cn/campus/view/id/610019", "retrievalDate": "2026-09-17"},
    recruitmentProcess: "简历投递→AI面试→专业面试→线上测评→综合面试→Offer发放→三方签约",
    processSource: {"level": "E2", "name": "官方校招简章（西北政法大学就业网）", "url": "https://job.nwupl.edu.cn/campus/view/id=1011157", "retrievalDate": "2026-09-17"},
    writtenTest: "有（AI面试+线上测评）",
    testSource: {"level": "E2", "name": "官方校招简章", "url": "https://job.nwupl.edu.cn/campus/view/id/1011157", "retrievalDate": "2026-09-17"}
  },
  {
    company: "格兰仕", 
    salary: "市场营销类（含电商）首年年薪7-12万；职能支持类7-10万",
    salarySource: {"level": "E2", "name": "官方校招简章（广东外语外贸大学就业网）", "url": "https://career.gdufs.edu.cn/index.php/web/index/jobs-brief-detail?id=VNUXSMW", "retrievalDate": "2026-09-17"},
    recruitmentProcess: "简历投递→简历筛选→AI面试&网络测评→初试→复试→审批录用",
    processSource: {"level": "E2", "name": "官方校招简章", "url": "https://career.gdufs.edu.cn/index.php/web/index/jobs-brief-detail?id=VNUXSMW", "retrievalDate": "2026-09-17"},
    writtenTest: "有（AI面试+网络测评）",
    testSource: {"level": "E2", "name": "官方校招简章", "url": "https://career.gdufs.edu.cn/index.php/web/index/jobs-brief-detail?id=VNUXSMW", "retrievalDate": "2026-09-17"}
  },
  {
    company: "优必选科技", 
    salary: "其他类（非研发）10K-20K/月",
    salarySource: {"level": "E2", "name": "官方校招简章（华南师范大学就业网）", "url": "http://career.scnu.edu.cn/detail/online?id=3592437", "retrievalDate": "2026-09-17"},
    recruitmentProcess: "网申→在线笔试（部分研发岗）→在线面试→Offer→签约",
    processSource: {"level": "E2", "name": "官方校招页", "url": "http://zhaopin.ubtrobot.com/campus", "retrievalDate": "2026-09-17"},
    writtenTest: "有（在线笔试，仅部分研发岗）",
    testSource: {"level": "E2", "name": "官方校招页", "url": "http://zhaopin.ubtrobot.com/campus", "retrievalDate": "2026-09-17"}
  },
  {
    company: "欣锐科技", 
    salary: "面议/未公布（官方称「极具市场竞争力的岗位薪资」）",
    salarySource: {"level": "E2", "name": "官方校招简章（哈工大就业网）", "url": "https://career.hit.edu.cn/zhxy-xszyfzpt/zpxx/zczphxq?id=NzVmZWNhNmE4MDBhNGI1Y2E1ZTUxMzI4NGE5MDkwMWY=", "retrievalDate": "2026-09-17"},
    recruitmentProcess: "网申→笔试（研发岗/技术岗）→专业面→HR面→综合面→offer",
    processSource: {"level": "E2", "name": "官方校招简章", "url": "https://career.hit.edu.cn/zhxy-xszyfzpt/zpxx/zczphxq?id=NzVmZWNhNmE4MDBhNGI1Y2E1ZTUxMzI4NGE5MDkwMWY=", "retrievalDate": "2026-09-17"},
    writtenTest: "有（笔试，仅限研发岗/技术岗）",
    testSource: {"level": "E2", "name": "官方校招简章", "url": "https://career.hit.edu.cn/zhxy-xszyfzpt/zpxx/zczphxq?id=NzVmZWNhNmE4MDBhNGI1Y2E1ZTUxMzI4NGE5MDkwMWY=", "retrievalDate": "2026-09-17"}
  },
  {
    company: "雀巢中国（Nestlé）", 
    salary: "面议/未公布（官方称“全面薪资福利/有竞争力起薪”，未公布具体区间）",
    salarySource: {"level": "E2", "name": "雀巢中国校招官网", "url": "https://stg.nestlecareers.cn/zh-hans/application-process", "retrievalDate": "2026-09-17"},
    recruitmentProcess: "即刻投递→线上测评→HR电话面试(9月起)→评估中心(10月起)→发放Offer(11月起)",
    processSource: {"level": "E2", "name": "雀巢中国校招官网申请流程", "url": "https://stg.nestlecareers.cn/zh-hans/application-process", "retrievalDate": "2026-09-17"},
    writtenTest: "有（线上测评/在线测试）",
    testSource: {"level": "E2", "name": "雀巢中国校招官网申请流程", "url": "https://stg.nestlecareers.cn/zh-hans/application-process", "retrievalDate": "2026-09-17"}
  },
  {
    company: "蜜雪冰城（蜜雪集团）", 
    salary: "产品经理/综合职能类 6K-10K/月；法务方向 7K-9K/月",
    salarySource: {"level": "E2", "name": "蜜雪冰城校招官网职位JD", "url": "https://mxbc1997.zhiye.com/jobs", "retrievalDate": "2026-09-17；E3"},
    recruitmentProcess: "网申→测评/初筛(投递后3日内完成测评)→初试→复试→Offer",
    processSource: {"level": "E2", "name": "蜜雪冰城校招官网", "url": "https://mxbc1997.zhiye.com/campus", "retrievalDate": "2026-09-17"},
    writtenTest: "有（测评，投递后3日内须完成）",
    testSource: {"level": "E2", "name": "蜜雪冰城校招官网", "url": "https://mxbc1997.zhiye.com/campus", "retrievalDate": "2026-09-17"}
  }
];

export const companyRecruitmentMethodology = {
  version: '1.0',
  scope: 'AI_Job公司清单 90 家公司',
  retrievalDate: '2026-09-17',
  note: '证据分级 E1=官方原文 E2=官方页面 E3=官方转载 E4=二手来源 E5=推测；官方未明确处标注待核实/推测，不编造。'
};