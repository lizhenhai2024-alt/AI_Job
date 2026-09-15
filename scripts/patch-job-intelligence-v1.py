#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def patch(rel, replacements):
    path = ROOT / rel
    text = path.read_text(encoding='utf-8')
    original = text
    for old, new in replacements:
        if old not in text:
            raise SystemExit(f'{rel}: expected fragment not found:\n{old[:220]}')
        text = text.replace(old, new, 1)
    if text == original:
        raise SystemExit(f'{rel}: no changes made')
    path.write_text(text, encoding='utf-8')
    print(f'patched {rel}')


patch('scripts/enrich-job-compensation.mjs', [
    (
        "import { enrichJobCompensation } from '../src/core/compensation.js';\nimport { normalizeJobLanguages } from './job-discovery/languages.mjs';",
        "import { enrichJobCompensation } from '../src/core/compensation.js';\nimport { enrichJobHeadcount } from '../src/core/headcount.js';\nimport { normalizeJobLanguages } from './job-discovery/languages.mjs';"
    ),
    (
        "const enriched = languageNormalized.map(enrichJobCompensation);\nconst disclosed = enriched.filter((job) => job.compensation?.disclosed).length;",
        "const enriched = languageNormalized.map(enrichJobCompensation).map(enrichJobHeadcount);\nconst disclosed = enriched.filter((job) => job.compensation?.disclosed).length;"
    ),
    (
        "const annualized = enriched.filter((job) => job.compensation?.annualMin != null).length;\nconst withLanguages",
        "const annualized = enriched.filter((job) => job.compensation?.annualMin != null).length;\nconst headcountDisclosed = enriched.filter((job) => job.headcount?.disclosed).length;\nconst headcountOfficial = enriched.filter((job) => job.sourceType === 'official' && job.headcount?.disclosed).length;\nconst headcountJobLevel = enriched.filter((job) => job.headcount?.disclosed && job.headcount?.scope === 'job').length;\nconst headcountProgramLevel = enriched.filter((job) => job.headcount?.disclosed && job.headcount?.scope === 'program').length;\nconst publicationKnown = enriched.filter((job) => /^\\d{4}-\\d{2}-\\d{2}$/.test(String(job.publishedAt || ''))).length;\nconst withLanguages"
    ),
    (
        "    compensation: {\n      disclosed,\n      officialDisclosed,\n      annualized,\n      undisclosed: Math.max(0, enriched.length - disclosed),\n      totalJobs: enriched.length\n    }",
        "    compensation: {\n      disclosed,\n      officialDisclosed,\n      annualized,\n      undisclosed: Math.max(0, enriched.length - disclosed),\n      totalJobs: enriched.length\n    },\n    headcount: {\n      disclosed: headcountDisclosed,\n      officialDisclosed: headcountOfficial,\n      jobLevel: headcountJobLevel,\n      programLevel: headcountProgramLevel,\n      undisclosed: Math.max(0, enriched.length - headcountDisclosed),\n      totalJobs: enriched.length\n    },\n    publication: {\n      known: publicationKnown,\n      unknown: Math.max(0, enriched.length - publicationKnown),\n      totalJobs: enriched.length\n    }"
    ),
    (
        "薪资情报规则：仅解析来源页/JD明确披露的薪资；月薪转年薪按明确薪数计算，未写薪数时仅按12薪估算并显式标记；“面议/未披露”不猜测。",
        "薪资情报规则：仅解析来源页/JD明确披露的薪资；月薪转年薪按明确薪数计算，未写薪数时仅按12薪估算并显式标记；“面议/未披露”不猜测。HC规则：只保留ATS结构化字段或JD明确招聘人数，区分岗位HC(job)与整届/项目招聘规模(program)，公司员工规模不得推断为HC。发布日期只认来源披露的publishedAt/datePosted/PostDate等字段，discoveredAt不得冒充发布日期。"
    ),
    (
        "console.log(`[compensation] disclosed=${disclosed}/${enriched.length} official=${officialDisclosed} annualized=${annualized}`);",
        "console.log(`[compensation] disclosed=${disclosed}/${enriched.length} official=${officialDisclosed} annualized=${annualized}`);\nconsole.log(`[headcount] disclosed=${headcountDisclosed}/${enriched.length} official=${headcountOfficial} job=${headcountJobLevel} program=${headcountProgramLevel}`);\nconsole.log(`[publication] known=${publicationKnown}/${enriched.length}`);"
    )
])

patch('scripts/check-compensation.mjs', [
    (
        "const stats = mod.discoveryMeta?.stats?.compensation;",
        "const stats = mod.discoveryMeta?.stats?.compensation;\nconst headcount = mod.discoveryMeta?.stats?.headcount;\nconst publication = mod.discoveryMeta?.stats?.publication;"
    ),
    (
        "console.log(`[compensation-check] OK disclosed=${stats.disclosed}/${stats.totalJobs} official=${stats.officialDisclosed}`);",
        "if (!headcount || typeof headcount.disclosed !== 'number' || typeof headcount.jobLevel !== 'number' || typeof headcount.programLevel !== 'number') {\n  console.error(`[headcount-check] FAIL: stats.headcount missing or invalid: ${JSON.stringify(headcount)}`);\n  process.exit(1);\n}\nif (!publication || typeof publication.known !== 'number') {\n  console.error(`[publication-check] FAIL: stats.publication missing or invalid: ${JSON.stringify(publication)}`);\n  process.exit(1);\n}\nconsole.log(`[compensation-check] OK disclosed=${stats.disclosed}/${stats.totalJobs} official=${stats.officialDisclosed}`);\nconsole.log(`[headcount-check] OK disclosed=${headcount.disclosed}/${headcount.totalJobs} job=${headcount.jobLevel} program=${headcount.programLevel}`);\nconsole.log(`[publication-check] OK known=${publication.known}/${publication.totalJobs}`);"
    )
])

patch('scripts/job-discovery/beisen.mjs', [
    (
        "    salary: cleanText(row.Salary || ''),\n    status: '推荐',",
        "    salary: cleanText(row.Salary || ''),\n    // 北森 API 已请求 HeadCount；此前这里没有保留，导致岗位 HC 在标准化前被丢掉。\n    headcountRaw: cleanText(row.HeadCount ?? row.RecruitNumber ?? row.RecruitCount ?? ''),\n    status: '推荐',"
    )
])

patch('package.json', [
    (
        "node --check src/core/compensation.js && node --check src/core/company-risk.js",
        "node --check src/core/compensation.js && node --check src/core/headcount.js && node --check src/core/company-risk.js"
    )
])

patch('.github/workflows/refresh-campus-jobs.yml', [
    (
        "      - 'src/core/compensation.js'\n      - 'config/search-profile.json'",
        "      - 'src/core/compensation.js'\n      - 'src/core/headcount.js'\n      - 'config/search-profile.json'"
    ),
    (
        "      - name: Verify compensation enrichment\n        run: node scripts/check-compensation.mjs",
        "      - name: Verify job intelligence enrichment\n        run: node scripts/check-compensation.mjs"
    )
])

patch('scripts/refresh-jobs-scoped.mjs', [
    (
        "    const stats = liveModule.discoveryMeta?.stats?.compensation;\n    const invalidSourceJobs",
        "    const stats = liveModule.discoveryMeta?.stats?.compensation;\n    const headcountStats = liveModule.discoveryMeta?.stats?.headcount;\n    const publicationStats = liveModule.discoveryMeta?.stats?.publication;\n    const invalidSourceJobs"
    ),
    (
        "    } else if (invalidSourceJobs.length) {",
        "    } else if (!headcountStats || typeof headcountStats.disclosed !== 'number' || !publicationStats || typeof publicationStats.known !== 'number') {\n      console.error(`[job-intelligence-check] FAIL: headcount/publication stats missing (headcount=${JSON.stringify(headcountStats)} publication=${JSON.stringify(publicationStats)})`);\n      exitCode = 1;\n    } else if (invalidSourceJobs.length) {"
    ),
    (
        "      console.log(`[compensation-check] OK disclosed=${stats.disclosed}/${stats.totalJobs} official=${stats.officialDisclosed}`);\n      console.log(`[source-policy-check] OK official-preferred jobs=${liveModule.liveJobs.length} trustedUniversityOfficialBacked=${bridgeCount}`);",
        "      console.log(`[compensation-check] OK disclosed=${stats.disclosed}/${stats.totalJobs} official=${stats.officialDisclosed}`);\n      console.log(`[headcount-check] OK disclosed=${headcountStats.disclosed}/${headcountStats.totalJobs} job=${headcountStats.jobLevel} program=${headcountStats.programLevel}`);\n      console.log(`[publication-check] OK known=${publicationStats.known}/${publicationStats.totalJobs}`);\n      console.log(`[source-policy-check] OK official-preferred jobs=${liveModule.liveJobs.length} trustedUniversityOfficialBacked=${bridgeCount}`);"
    )
])

print('AI_Job job-intelligence-v1 patch complete')
