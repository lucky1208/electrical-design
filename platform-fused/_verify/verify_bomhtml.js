/* 验证交互式 BOM 的安全性、链接与语义分离 */
'use strict';
const fs = require('fs');
const path = require('path');
const f = path.join(process.env.TEMP, 'integ_check', 'it_BOM.html');
const html = fs.readFileSync(f, 'utf8');
console.log('文件大小 =', Math.round(html.length / 1024), 'KB');

const links = [...html.matchAll(/<a href="([^"]+)"([^>]*)>/g)];
console.log('链接总数 =', links.length);
const unique = new Set(links.map((m) => m[1]));
console.log('唯一 URL 数 =', unique.size);
console.log('\n=== 全部唯一链接 ===');
[...unique].sort().forEach((u) => console.log('   ' + u));

console.log('\n=== 安全断言 ===');
const unsafe = links.filter((m) => !/^https?:\/\//.test(m[1]));
console.log('非 http(s) 链接数（必须 0）=', unsafe.length);
unsafe.slice(0, 5).forEach((m) => console.log('   !! ' + m[1]));
const noRel = links.filter((m) => !/rel="noopener noreferrer"/.test(m[2]));
console.log('缺 rel=noopener 的链接数（必须 0）=', noRel.length);
const noTarget = links.filter((m) => !/target="_blank"/.test(m[2]));
console.log('缺 target=_blank 的链接数（必须 0）=', noTarget.length);

console.log('\n=== 注入防护 ===');
console.log('内联 <script> 数（必须 0）=', (html.match(/<script/gi) || []).length);
console.log('on* 事件属性数（必须 0）=', (html.match(/\son[a-z]+\s*=/gi) || []).length);
console.log('未转义的裸 & 数 =', (html.match(/&(?!amp;|lt;|gt;|quot;|#39;)/g) || []).length);

console.log('\n=== 语义分离 ===');
console.log('含「信任列」标注 =', html.includes('（信任列）'));
console.log('含「参考」标注   =', html.includes('（参考）'));
console.log('含「未经批准，不得作为选型依据」=', html.includes('不得作为选型依据'));
console.log('含未批准占位 PART_SELECTION_REQUIRED =', html.includes('PART_SELECTION_REQUIRED'));

console.log('\n=== 表结构 ===');
console.log('表格数 =', (html.match(/<table>/g) || []).length);
console.log('行数   =', (html.match(/<tr>/g) || []).length - (html.match(/<thead>/g) || []).length);
const cats = [...html.matchAll(/<h2>([^<]+)<span/g)].map((m) => m[1].trim());
console.log('类别分组 =', cats.join(' / '));
