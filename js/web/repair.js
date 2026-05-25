const fs = require('fs');
const path = 'd:\\專題\\專題V4.1\\專題V4\\js\\web\\index.html';
let html = fs.readFileSync(path, 'utf8');

const matches = html.match(/.{0,20}\-container.{0,20}/g) || [];
console.log("Matches found:", matches);

// Fixes:
// 1. class=-container>
html = html.replace(/class=-container>/g, 'class="page-container">');

// 2. whitespace followed by -container{ or { 
html = html.replace(/([ \t]*)\-container([ \t]*)\{/g, '$1.page-container$2{');

// 3. .section > -container
html = html.replace(/\.section > -container/g, '.section > .page-container');

// 4. class=-containerhero__grid"
html = html.replace(/class=-containerhero__grid"/g, 'class="page-container hero__grid"');

// 5. class=-containerfooter__inner"
html = html.replace(/class=-containerfooter__inner"/g, 'class="page-container footer__inner"');

fs.writeFileSync(path, html);
console.log("Successfully fixed spacing/class corruption and renamed to page-container.");
