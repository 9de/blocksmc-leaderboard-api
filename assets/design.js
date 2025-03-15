const { createCanvas, loadImage, registerFont } = require('canvas');
const fs = require('fs');
const axios = require('axios');

registerFont('./assets/Minecraftia.ttf', { family: 'Minecraft' });

// Convert Minecraft color codes to hex
function minecraftColorToHex(colorCode) {
  const colorMap = {
    '§0': '#000000', // Black
    '§1': '#0000AA', // Dark Blue
    '§2': '#00AA00', // Dark Green
    '§3': '#00AAAA', // Dark Aqua
    '§4': '#AA0000', // Dark Red
    '§5': '#AA00AA', // Dark Purple
    '§6': '#FFAA00', // Gold
    '§7': '#AAAAAA', // Gray
    '§8': '#555555', // Dark Gray
    '§9': '#5555FF', // Blue
    '§a': '#55FF55', // Green
    '§b': '#55FFFF', // Aqua
    '§c': '#FF5555', // Red
    '§d': '#FF55FF', // Light Purple
    '§e': '#FFFF55', // Yellow
    '§f': '#FFFFFF', // White
  };

  return colorMap[colorCode] || '#FFFFFF';
}

// Improved emoji handling function
function normalizeText(text) {
  if (!text) return '';
  
  // Just return the original text without modifications
  // This allows the emoji to be rendered in its original position
  return text;
}

// Extract the color code and text from a string with Minecraft formatting
function parseMinecraftText(text) {
  if (!text) return [{ text: '', color: '#FFFFFF' }];
  
  // Don't modify the text, just parse color codes
  const parts = [];
  let currentIndex = 0;
  
  while (currentIndex < text.length) {
    if (text[currentIndex] === '§' && currentIndex + 1 < text.length) {
      const colorCode = text.substring(currentIndex, currentIndex + 2);
      const nextColorIndex = text.indexOf('§', currentIndex + 2);
      
      const endIndex = nextColorIndex !== -1 ? nextColorIndex : text.length;
      const content = text.substring(currentIndex + 2, endIndex);
      
      parts.push({
        text: content,
        color: minecraftColorToHex(colorCode)
      });
      
      currentIndex = endIndex;
    } else if (currentIndex === 0 && text[currentIndex] !== '§') {
      // Text without color code at the beginning
      const nextColorIndex = text.indexOf('§');
      const endIndex = nextColorIndex !== -1 ? nextColorIndex : text.length;
      parts.push({
        text: text.substring(0, endIndex),
        color: '#FFFFFF'
      });
      currentIndex = endIndex;
    } else {
      currentIndex++;
    }
  }
  
  return parts;
}



// Get clean username without Minecraft color codes
function getCleanUsername(formattedName) {
  return formattedName ? formattedName.replace(/§[0-9a-fA-F]/g, '') : '';
}

// Improved function to draw multicolored text with better emoji and special character handling
function drawMinecraftText(ctx, text, x, y, defaultAlignment = 'left', fontSize = 22) {
  if (!text) return x; // Return immediately if text is empty or undefined
  
  let currentX = x;
  const parts = parseMinecraftText(text);
  
  ctx.textAlign = defaultAlignment;
  ctx.font = `${fontSize}px 'Minecraft', sans-serif`;
  ctx.textBaseline = 'middle'; // Use middle alignment for consistent positioning
  
  if (defaultAlignment === 'right') {
    // Calculate total width for right alignment
    let totalWidth = 0;
    for (const part of parts) {
      totalWidth += ctx.measureText(part.text).width;
    }
    currentX = x - totalWidth;
  }
  
  // Draw each part of the text with its own color
  for (const part of parts) {
    if (!part.text) continue; // Skip empty parts
    
    ctx.fillStyle = part.color;
    ctx.fillText(part.text, currentX, y);
    currentX += ctx.measureText(part.text).width;
  }
  
  return currentX;
}

function drawGuildTag(ctx, guild, x, y, fontSize = 18) {
  if (!guild) return;

  // Configure text settings
  ctx.fillStyle = '#AAAAAA';
  ctx.font = `${fontSize}px "Minecraft", sans-serif`;
  ctx.textBaseline = 'middle';

  // Draw the separator dot
  const dot = ' • ';
  ctx.fillText(dot, x, y);
  const dotWidth = ctx.measureText(dot).width;

  // Normalize guild text and parse Minecraft-style formatting
  const emojiCorrections = { '❤': '❤️', '❤❤': '❤️❤️' };
  let guildText = guild.replace(/\[|\]/g, ' '); // Remove brackets
  const parts = parseMinecraftText(guildText);

  let currentX = x + dotWidth;
  for (const part of parts) {
    if (!part.text) continue;

    let trimmedText = part.text.trim();

    // Replace incorrect emojis
    if (emojiCorrections[trimmedText]) {
      part.text = emojiCorrections[trimmedText];
    }

    // Check if text is not English letters or numbers (treat as emoji)
    const isNonEnglishOrEmoji = /[^\x00-\x7F0-9a-zA-Z]/.test(trimmedText);

    // Apply text color and render
    ctx.fillStyle = part.color;
    ctx.fillText(part.text, currentX, isNonEnglishOrEmoji ? y - 7 : y);
    currentX += ctx.measureText(part.text).width;
  }
}


// Draw a circular avatar (completely round)
function drawCircularAvatar(ctx, image, x, y, size) {
  ctx.save();
  
  // Create circular clipping path
  ctx.beginPath();
  ctx.arc(x + size/2, y + size/2, size/2, 0, Math.PI * 2, true);
  ctx.closePath();
  ctx.clip();
  
  // Draw the image
  ctx.drawImage(image, x, y, size, size);
  
  ctx.restore();
}

// Fetch player heads using Minotar API - optimized with Promise.all for concurrent requests
async function fetchPlayerHeads(players) {
  const heads = {};
  
  // Create array of promises for concurrent fetching
  const promises = players.map(async (player) => {
    const cleanUsername = getCleanUsername(player.username);
    try {
      // Using Minotar API to get Minecraft heads with helm view
      const response = await axios.get(`https://minotar.net/helm/${cleanUsername}/100.png`, 
        { responseType: 'arraybuffer' });
      
      const buffer = Buffer.from(response.data, 'binary');
      const image = await loadImage(buffer);
      heads[cleanUsername] = image;
    } catch (error) {
      console.log(`Failed to fetch head for ${cleanUsername}, using placeholder`);
      // Create a placeholder colored circle based on their ranking
      const placeholderCanvas = createCanvas(100, 100);
      const ctx = placeholderCanvas.getContext('2d');
      
      // Use different colors based on ranking
      if (player.top === 1) ctx.fillStyle = '#FFD700';
      else if (player.top === 2) ctx.fillStyle = '#C0C0C0';
      else if (player.top === 3) ctx.fillStyle = '#CD7F32';
      else ctx.fillStyle = `hsl(${player.top * 36}, 70%, 60%)`;
      
      // Draw circle instead of square
      ctx.beginPath();
      ctx.arc(50, 50, 50, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.fillStyle = '#333';
      ctx.font = 'bold 16px Minecraft';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(player.top, 50, 50);
      
      heads[cleanUsername] = await loadImage(placeholderCanvas.toBuffer());
    }
  });
  
  // Wait for all head fetching operations to complete
  await Promise.all(promises);
  
  return heads;
}

/**
 * 
 * @param {string[]} userData 
 * @param {string} time 
 * @returns 
 */
async function createLeaderboard(userData, time) {

  // Fetch player heads
  const playerHeads = await fetchPlayerHeads(userData);

  // Create canvas with adjusted height to fit all 10 players
  const width = 1000;
  const height = 800; // Increased height
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Load background image or create a gradient background
  const backgroundGradient = ctx.createLinearGradient(0, 0, width, height);
  backgroundGradient.addColorStop(0, '#2B323C');
  backgroundGradient.addColorStop(1, '#1C1F2B');
  ctx.fillStyle = backgroundGradient;
  ctx.fillRect(0, 0, width, height);

  // Add some decorative elements - hexagonal pattern (optimized to draw fewer hexagons)
  ctx.globalAlpha = 0.1;
  ctx.strokeStyle = '#8F9CB3';
  ctx.lineWidth = 1;

  // Draw fewer hexagons with larger spacing for better performance
  for (let i = -100; i < width + 100; i += 100) {
    for (let j = -100; j < height + 100; j += 100) {
      ctx.beginPath();
      ctx.arc(i, j, 30, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;

  // Load and draw BlocksMC icon
  try {
    const blocksIconUrl = 'https://raw.githubusercontent.com/LabyMod/server-media/refs/heads/master/minecraft_servers/blocksmc/icon.png';
    const blocksIcon = await loadImage(blocksIconUrl);
    const cardX = width * 0.1;
    const cardY = 100;

    // Position the icon in the upper left of the card
    const iconSize = 66;
    const iconX = cardX - 90; // Position icon to overlap with the card's left edge
    const iconY = cardY - 90; // Position icon to overlap with the card's top edge
    
    // Draw with a subtle glow effect
    ctx.save();
    ctx.shadowColor = 'rgba(255, 255, 255, 0.6)';
    ctx.shadowBlur = 15;
    
    // Draw circular icon
    drawCircularAvatar(ctx, blocksIcon, iconX, iconY, iconSize);
    ctx.restore();
    
  } catch (error) {
    console.log('Failed to load BlocksMC icon:', error);
  }
  const cardX = width * 0.1;

  // Add a modern card container with adjusted height
  const cardY = 100;
  const cardWidth = width * 0.8;
  const cardHeight = height - 150;
  
  // Card with rounded corners and shadow effect
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
  ctx.shadowBlur = 20;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 10;
  
  // Card background
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.beginPath();
  ctx.roundRect(cardX, cardY, cardWidth, cardHeight, 15);
  ctx.fill();
  ctx.restore();

  // Draw title
  ctx.font = 'bold 48px "Minecraft", sans-serif';
  const gradient = ctx.createLinearGradient(width / 2 - 100, 0, width / 2 + 100, 0);
  gradient.addColorStop(0, '#4F46E5');
  gradient.addColorStop(1, '#EC4899');
  ctx.fillStyle = gradient;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle'; // Use consistent textBaseline
  ctx.fillText(`TOP PLAYERS ${time === "YEARLY" ? "LIFETIME" : time.toUpperCase()}`, width / 2, 70);

  // Draw a decorative underline
  const gradientLine = ctx.createLinearGradient(width/2 - 100, 0, width/2 + 100, 0);
  gradientLine.addColorStop(0, '#4568DC');
  gradientLine.addColorStop(1, '#B06AB3');
  
  ctx.strokeStyle = gradientLine;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(width/2 - 100, 85);
  ctx.lineTo(width/2 + 100, 85);
  ctx.stroke();

  // Draw table headers
  ctx.font = 'bold 24px "Minecraft", sans-serif';
  ctx.fillStyle = '#A3B1CC';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle'; // Use consistent textBaseline
  
  ctx.fillText('RANK', cardX + 60, cardY + 50);
  ctx.fillText('PLAYER', cardX + cardWidth * 0.45, cardY + 50);
  ctx.fillText('TIME', cardX + cardWidth - 80, cardY + 50);

  // Draw header line
  ctx.beginPath();
  ctx.moveTo(cardX + 30, cardY + 65);
  ctx.lineTo(cardX + cardWidth - 30, cardY + 65);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Draw rows with adjusted spacing to ensure all 10 fit
  const rowHeight = 55; // Slightly reduced row height
  const startY = cardY + 110;

  for (let i = 0; i < userData.length; i++) {
    const user = userData[i];
    const rowCenterY = startY + i * rowHeight; // Center of the row for text alignment
    const isEven = i % 2 === 0;
    
    // Row highlight for even rows
    if (isEven) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
      ctx.beginPath();
      ctx.roundRect(cardX + 20, rowCenterY - 30, cardWidth - 40, rowHeight, 10);
      ctx.fill();
    }
    
    // Top 3 row highlighting
    if (user.top <= 3) {
      const highlightColors = ['rgba(255, 215, 0, 0.15)', 'rgba(192, 192, 192, 0.15)', 'rgba(205, 127, 50, 0.15)'];
      ctx.fillStyle = highlightColors[user.top - 1];
      ctx.beginPath();
      ctx.roundRect(cardX + 20, rowCenterY - 30, cardWidth - 40, rowHeight, 10);
      ctx.fill();
    }
    
    // Draw rank
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 24px "Minecraft", sans-serif';
    
    // Special colors for top 3
    const rankColors = ['#FFD700', '#C0C0C0', '#CD7F32'];
    if (user.top <= 3) {
      
      // Draw a circle behind the top 3 ranks
      ctx.beginPath();
      ctx.arc(cardX + 60, rowCenterY, 22, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${user.top === 1 ? '255, 215, 0' : user.top === 2 ? '192, 192, 192' : '205, 127, 50'}, 0.2)`;
      ctx.fill();
      
      ctx.fillStyle = rankColors[user.top - 1];
    } else {
      ctx.fillStyle = '#FFFFFF';
    }
    
    // Draw rank number with consistent vertical alignment
    ctx.fillText(`#${user.top}`, cardX + 60, rowCenterY);
    
    // Draw player head as circular avatar
    const cleanUsername = getCleanUsername(user.username);
    if (playerHeads[cleanUsername]) {
      const headSize = 40; // Standard head size
      const headX = cardX + 108; // Adjusted position
      const headY = rowCenterY - (headSize/2) - 5; // Center vertically
      
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
      ctx.shadowBlur = 5;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 2;
      
      // Draw circular avatar instead of square
      drawCircularAvatar(ctx, playerHeads[cleanUsername], headX, headY, headSize);
      
      ctx.restore();
    }
    
    // Draw username and guild
    ctx.textAlign = 'left';
    const usernameX = cardX + 170;
    
    // Draw username with improved vertical alignment
    const endX = drawMinecraftText(ctx, user.username, usernameX, rowCenterY, 'left', 20);
    
    // Improved guild rendering with proper emoji and special character handling
    if (user.guild) {
      // Use the dedicated guild tag drawing function
      drawGuildTag(ctx, user.guild, endX, rowCenterY);
    }
    
    // Draw hours
    ctx.font = 'bold 20px "Minecraft", sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    
    // Gradient text for hours
    if (user.top <= 3) {
      const gradient = ctx.createLinearGradient(
        cardX + cardWidth - 180, rowCenterY - 10, 
        cardX + cardWidth - 80, rowCenterY + 10
      );
      
      if (user.top === 1) {
        gradient.addColorStop(0, '#FFD700');
        gradient.addColorStop(1, '#FFA500');
      } else if (user.top === 2) {
        gradient.addColorStop(0, '#E0E0E0');
        gradient.addColorStop(1, '#A0A0A0');
      } else {
        gradient.addColorStop(0, '#CD7F32');
        gradient.addColorStop(1, '#8B4513');
      }
      
      ctx.fillStyle = gradient;
    } else {
      ctx.fillStyle = '#FFFFFF';
    }
    
    // Draw hours text with consistent vertical alignment
    ctx.fillText(`${user.hour} ${time === "YEARLY" ? "Day" : "Hours"}`, cardX + cardWidth - 60, rowCenterY);
  }

  // Fixed footer with simpler design
  const footerY = height - 20;
  
  // Enhanced footer with more style and information
  ctx.font = 'italic 18px "Minecraft", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Create a subtle gradient for the text
  const footerGradient = ctx.createLinearGradient(width/2 - 100, footerY, width/2 + 100, footerY);
  footerGradient.addColorStop(0, '#A3B1CC');
  footerGradient.addColorStop(1, '#8F9CB3');
  ctx.fillStyle = footerGradient;

  // Add more detail to the date formatting
  const now = new Date();
  const options = { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' };
  const dateString = now.toLocaleDateString('en-US', options);
  
  // Draw footer text
  ctx.fillText(`Last Updated: ${dateString}`, width / 2, footerY);

  // Save the image
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync('background.png', buffer);

  return buffer;
}

module.exports = {
  createLeaderboard,
  minecraftColorToHex,
  getCleanUsername
};

