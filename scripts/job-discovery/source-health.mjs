function number(value) { return Number(value || 0); }

export function evaluateSourceHealth(provider, source = {}, stats = {}) {
  const company = source.company || '未知公司';
  const errors = number(stats.errors) + number(stats.detailErrors);
  if (errors > 0) return { provider, company, status: 'error', healthy: false, reason: `来源抓取存在 ${errors} 个错误` };

  if (provider === 'feishu') {
    const listed = number(stats.listed);
    const cohort = number(stats.cohortMatched);
    const formal = Math.max(0, cohort - number(stats.internRejected) - number(stats.socialRejected));
    const path = String(source.websitePath || stats.websitePath || '');
    if (listed <= 0 || stats.emptyResult) return { provider, company, status: 'empty', healthy: false, reason: '官方飞书源当前返回0个岗位' };
    if (cohort <= 0) return { provider, company, status: 'no_2027', healthy: false, reason: `已列出${listed}个岗位，但没有识别到2027届证据` };
    if (formal <= 0) return { provider, company, status: 'no_formal_2027', healthy: false, reason: `识别到${cohort}个2027岗位，但全部属于实习/社招；需要定位正式批入口` };
    const generic = /^(index|home|jobs?)$/i.test(path);
    const ratio = listed ? cohort / listed : 0;
    if (generic && listed >= 500 && ratio < 0.1) {
      return { provider, company, status: 'broad_scope', healthy: false, reason: `总招聘入口过宽：${listed}个岗位仅${cohort}个带2027证据，应切换到2027校招专属入口` };
    }
    return { provider, company, status: 'healthy', healthy: true, reason: `官方飞书源正常：列出${listed}，正式2027候选${formal}，筛选后${number(stats.keptJobs)}` };
  }

  if (provider === 'beisen') {
    const scanned = number(stats.scannedRows);
    if (scanned <= 0) return { provider, company, status: 'empty', healthy: false, reason: '北森源本轮没有扫描到岗位，需检查模板/API或招聘状态' };
    return { provider, company, status: 'healthy', healthy: true, reason: `北森源正常：扫描${scanned}，源内保留${number(stats.keptJobs)}` };
  }

  if (provider === 'moka') {
    const discovered = number(stats.discoveredUrls ?? stats.listed ?? stats.scannedRows);
    if (discovered <= 0) return { provider, company, status: 'empty', healthy: false, reason: 'Moka源本轮没有发现岗位，需检查校园招聘入口' };
    return { provider, company, status: 'healthy', healthy: true, reason: `Moka源正常：发现${discovered}，源内保留${number(stats.keptJobs)}` };
  }

  if (provider === 'hotjob') {
    const listed = number(stats.listed ?? stats.totalPositions);
    if (listed <= 0) return { provider, company, status: 'empty', healthy: false, reason: 'HotJob源本轮没有列出岗位' };
    return { provider, company, status: 'healthy', healthy: true, reason: `HotJob源正常：列出${listed}，源内保留${number(stats.keptJobs)}` };
  }

  const listed = number(stats.listed ?? stats.detailed ?? stats.pages);
  if (listed <= 0) return { provider, company, status: 'unknown', healthy: false, reason: '本轮缺少足够来源健康统计' };
  return { provider, company, status: 'healthy', healthy: true, reason: `官方源正常：本轮活动量${listed}，源内保留${number(stats.keptJobs)}` };
}

function providerSources(officialSources, provider) {
  const value = officialSources?.[provider];
  return Array.isArray(value) ? value : value ? [value] : [];
}

export function buildSourceHealth(sourceStats = {}, officialSources = {}) {
  const companies = [];
  for (const provider of Object.keys(officialSources || {})) {
    const sources = providerSources(officialSources, provider);
    for (const source of sources) {
      const providerStats = sourceStats?.[provider] || {};
      const stats = providerStats.perPortal?.[source.company] || (sources.length === 1 ? providerStats : {});
      companies.push(evaluateSourceHealth(provider, source, stats));
    }
  }
  const counts = companies.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {});
  return {
    companies,
    counts,
    total: companies.length,
    healthy: companies.filter((item) => item.healthy).length,
    attention: companies.filter((item) => !item.healthy).length
  };
}
