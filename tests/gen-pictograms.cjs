const fs=require('fs'),path=require('path');
const src='E:/ess-electrical-design/ess-agent-main/images/icon';
const map={acdc:'AC_DC.svg',dcac:'DC_AC.svg',ems:'EMS.svg',pdu:'PDU.svg',ups:'UPS.svg',pv:'光伏板.svg',pv_sun:'光伏板_太阳.svg',breaker:'断路器.svg',battery:'电池包.svg',meter:'电表.svg',transformer:'隔离变压器.svg'};
let out='/* 图片层: 内联矢量电气图标 (源自 ess-agent-main/images/icon, 自包含) */\nwindow.PIC=(function(){\n"use strict";\nconst D={\n';
for(const[k,f]of Object.entries(map)){
  const t=fs.readFileSync(path.join(src,f),'utf8');
  const vb=(t.match(/viewBox="([^"]+)"/)||['','0 0 1024 1024'])[1];
  const inner=(t.match(/<svg[^>]*>([\s\S]*)<\/svg>/)||['',''])[1];
  out+=`${k}:{vb:${JSON.stringify(vb)},inner:${JSON.stringify(inner)}},\n`;
}
out+=`};\nfunction draw(name,x,y,w,h,color){const d=D[name];if(!d)return'';return \`<svg x="\${x}" y="\${y}" width="\${w}" height="\${h}" viewBox="\${d.vb}"><g fill="\${color||'#334155'}">\${d.inner}</g></svg>\`;}\nreturn {draw,keys:Object.keys(D)};\n})();\n`;
fs.writeFileSync('E:/ess-electrical-design/electrical-design/js/pictograms.js',out);
console.log('pictograms keys:',Object.keys(map).length);
