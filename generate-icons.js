// 生成扩展程序图标的脚本
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

async function generateIcons() {
  const sizes = [16, 32, 48, 128];
  const iconsDir = path.join(__dirname, 'chrome-extension', 'icons');
  const svgPath = path.join(iconsDir, 'icon.svg');
  
  // 确保目录存在
  if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
  }
  
  // 读取SVG文件
  if (!fs.existsSync(svgPath)) {
    console.error('错误: 找不到 icon.svg 文件');
    process.exit(1);
  }
  
  const svgContent = fs.readFileSync(svgPath, 'utf8');
  const buffer = Buffer.from(svgContent);
  
  console.log('正在生成图标...');
  
  for (const size of sizes) {
    try {
      await sharp(buffer)
        .resize(size, size)
        .png()
        .toFile(path.join(iconsDir, `icon${size}.png`));
      console.log(`✓ 生成 icon${size}.png (${size}x${size})`);
    } catch (err) {
      console.error(`✗ 生成 icon${size}.png 失败:`, err.message);
    }
  }
  
  console.log('图标生成完成！');
}

generateIcons().catch(console.error);
