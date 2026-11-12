import { readFileSync, writeFileSync } from 'node:fs';
const root=new URL('.',import.meta.url);
const file=name=>readFileSync(new URL(name,root),'utf8');
let page=file('page.template.html');
page=page.replace('<link rel="stylesheet" href="style.css">',`<style>\n${file('style.css')}\n${file('app.css')}\n</style>`);
page=page.replace('<script src="config.js"></script>',`<script>\n${file('config.js')}\n</script>`);
page=page.replace('<script src="game.js"></script>',`<script>\n${file('game.js').replaceAll('</script','<\\/script')}\n</script>`);
writeFileSync(new URL('index.html',root),page);
console.log('Created self-contained index.html with all CSS and JS bundled.');
