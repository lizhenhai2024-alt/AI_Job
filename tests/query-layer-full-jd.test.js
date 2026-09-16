import test from 'node:test';
import assert from 'node:assert/strict';

import { toQueryJob } from '../scripts/build-query-layer.mjs';

test('query layer preserves both JD sections and factual evidence', () => {
  const source = {
    id: 'transsion-j20453',
    company: '传音控股',
    title: '区域营销(J20453)',
    graduationYear: ['2027'],
    location: '国外',
    jobDescription: [
      '市场推广支持：协助制定并执行市场推广计划，参与线上线下活动策划与执行。',
      '数据分析与报告：收集市场数据，分析市场趋势、用户行为及竞争情况。',
      '内容创作：撰写营销文案、社交媒体内容及新闻稿。',
      '用户调研落地；活动策划并落地。'
    ].join('\n'),
    jobRequirements: [
      '本科及以上学历，2027届应届毕业生；法语或阿拉伯语专业优先。',
      '具备良好的语言沟通及书面表达能力，能适应跨文化工作环境。',
      '愿意长期驻外工作。',
      '有公众号、抖音、小红书、Instagram、TikTok等自媒体运营经验优先。'
    ].join('\n'),
    jdEvidence: {
      source: 'llm:test',
      majorClauses: ['本科及以上学历，2027届应届毕业生；法语或阿拉伯语专业优先。'],
      eligibilityClauses: ['本科及以上学历，2027届应届毕业生；法语或阿拉伯语专业优先。'],
      technicalDuties: [],
      businessDuties: ['跨文化沟通']
    },
    headcount: { disclosed: true, min: 3, max: 3, display: '3' },
    compensation: { confidence: 'high', sourceLabel: '官方ATS' },
    publishedAt: '2026-09-07',
    lastVerified: '2026-09-10',
    sourceType: 'official',
    officialURL: 'https://example.com/transsion/J20453'
  };

  const row = toQueryJob(source);
  assert.match(row.JD, /市场推广支持/);
  assert.match(row.JD, /愿意长期驻外工作/);
  assert.equal(row.jobDescription, source.jobDescription);
  assert.equal(row.jobRequirements, source.jobRequirements);
  assert.deepEqual(row.jdEvidence, source.jdEvidence);
  assert.deepEqual(row.headcount, source.headcount);
  assert.deepEqual(row.compensation, source.compensation);
  assert.equal(row.publishedAt, '2026-09-07');
  assert.equal(row.lastVerified, '2026-09-10');
  assert.equal(row.language.minorLanguageRequired, false, '小语种专业优先不能误判为硬性小语种要求');
});

test('combined JD de-duplicates a requirements section already embedded in description', () => {
  const combined = '工作职责：市场分析。\n任职要求：本科及以上。';
  const row = toQueryJob({
    company: 'A', title: '市场岗', description: combined,
    requirements: '本科及以上。'
  });
  assert.equal((row.JD.match(/本科及以上/g) || []).length, 1);
});
