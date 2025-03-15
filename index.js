require("dotenv").config();
const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const mineflayer = require("mineflayer");
const { pathfinder, Movements, goals } = require("mineflayer-pathfinder");
const { createLeaderboard } = require('./assets/design.js');
const NodeCache = require("node-cache"); 
const compression = require("compression"); 

// Initialize Express app with security middlewares
const app = express();
app.use(helmet()); // Security headers
app.use(cors()); // Enable CORS
app.use(express.json()); // Parse JSON bodies
app.use(compression()); // Compress responses

// Initialize cache with TTL (time-to-live) in seconds
const cache = new NodeCache({
  stdTTL: 300, // 5 minutes default TTL
  checkperiod: 60 // Check for expired items every 60 seconds
});

// Configure rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  legacyHeaders: true, // Enable the `X-RateLimit-*` headers
  message: { error: "Too many requests, please try again later." }
});

// Apply rate limiting to all requests
app.use(limiter);

// Minecraft bot configuration
let mcbot = null;
const topRegex = /§r§e#(\d+)\s(§[0-9a-fk-or]+[\w_]+)\s(?:(§[0-9a-fk-or]+)\[([^\]]+)\]\s)?§e\((\d+)\s(Hours|Days)\)/;
let uncategorizedPlayers = [];

const top = {
  LIFETIME: { lastUpdate: 0, users: [] },
  MONTHLY: { lastUpdate: 0, users: [] },
  WEEKLY: { lastUpdate: 0, users: [] },
};

// Bot retry mechanism
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY = 10000; // 10 seconds base delay

/**
 * Create and configure the Minecraft bot
 * @returns {Object} The created bot instance
 */
function createBot() {
  const bot = mineflayer.createBot({
    username: process.env.MC_USERNAME,
    host: "ccc.blocksmc.com",
    auth: "offline",
    version: "1.8.9",
  });
  
  bot.loadPlugin(pathfinder);
  bot.moved = false;

  bot.once("spawn", () => {
    console.log("Bot spawned, logging in...");
    setTimeout(() => {
      bot.chat("/login " + process.env.MC_PASSWORD);
      setTimeout(() => {
        bot.setControlState("back", true);
        setTimeout(() => bot.clearControlStates(), 100);
        console.log("Bot logged in successfully");
      }, 1000);
    }, 2000);
  });

  bot.on("entityUpdate", (entity) => {
    if (!entity?.metadata || entity.metadata[2] === undefined) return;
    const metadata = entity.metadata[2];

    const leaderboardStates = {
      "§r§6[§6§l§nLifetime§6] §f[Monthly] [Weekly]": "LIFETIME",
      "§r§f[Lifetime] §6[§6§l§nMonthly§6] §f[Weekly]": "MONTHLY",
      "§r§f[Lifetime] [Monthly] §6[§6§l§nWeekly§6]": "WEEKLY",
    };
    
    if (leaderboardStates[metadata]) {
      if(uncategorizedPlayers.length > 0) {
        const leaderboard = leaderboardStates[metadata];
        console.log(`Updating ${leaderboard} leaderboard with ${uncategorizedPlayers.length} players`);
        
        const topData = top[leaderboard];
        topData.lastUpdate = Date.now();
        if(topData.users.length > 0) topData.users = [];
        topData.users.push(...uncategorizedPlayers);
        uncategorizedPlayers = [];
        
        // Clear cache for this leaderboard when data is updated
        Object.keys(cache.keys()).forEach(key => {
          if (key.includes(leaderboard)) {
            cache.del(key);
          }
        });
      }
      
      if (!bot.moved) return bot.moveTo(entity.position);
      setTimeout(() => switchLeaderboardState(bot, entity), 30000);
    } else if (topRegex.test(metadata)) {
      updateLeaderboard(metadata);
    }
  });

  bot.on('message', (msg, position) => {
    if(position === "game_info") return;
    console.log(msg.toAnsi())
  });
  
  bot.on("error", (err) => {
    console.error(`Bot error: ${err.message}`);
  });
  
  bot.on("kicked", (reason) => {
    console.log(`Bot kicked: ${reason}`);
  });
  
  bot.on("end", () => {
    console.log("Bot session ended");
    setTimeout(() => {
          attemptReconnect();
    }, 5000);
  });
  
  bot.on("goal_reached", (goal) => handleGoalReached(bot, goal));

  // Optimize pathfinding for faster movement
  bot.moveTo = function (position) {
    const targetPos = { x: position.x, y: bot.entity.position.y, z: position.z };
    const movements = new Movements(bot);
    movements.canDig = false;
    movements.allowSprinting = true; // Enable sprinting for faster movement
    movements.canJump = true; // Enable jumping
    movements.allowParkour = false; // Disable parkour to reduce complexity
    bot.pathfinder.setMovements(movements);
    bot.pathfinder.setGoal(new goals.GoalNear(targetPos.x, targetPos.y, targetPos.z, 1)); // Use GoalNear instead of GoalBlock for faster pathing
  };
  
  return bot;
}

/**
 * Switch between leaderboard states (LIFETIME/Monthly/Weekly)
 * @param {Object} bot - The Minecraft bot instance
 * @param {Object} entity - The entity to interact with
 */
function switchLeaderboardState(bot, entity) {
  bot.activateEntityAt(entity, entity.position);
}

/**
 * Update the leaderboard with player data from entity metadata
 * @param {string} metadata - The entity metadata containing player info
 */
function updateLeaderboard(metadata) {
  const match = metadata.match(topRegex);
  if (match) {
    if (uncategorizedPlayers.length >= 10 && parseInt(match[1]) === 1) {
      uncategorizedPlayers = [];
    }
    
    uncategorizedPlayers.push({
      top: parseInt(match[1]),
      username: match[2],
      guild: match[4] ? `${match[3]}[${match[4]}]` : "",
      hour: parseInt(match[5]),
      timeUnit: match[6],
      time: Date.now(),
    });
  }
}

/**
 * Handle the event when the bot reaches its pathfinding goal
 * @param {Object} bot - The Minecraft bot instance
 * @param {Object} goal - The reached goal
 */
function handleGoalReached(bot, goal) {
  if (!goal) return console.log("Goal is undefined.");
  
  bot.moved = true;
  const nearestEntity = bot.nearestEntity((e) => 
    e.displayName === "Armor Stand" && 
    e.metadata && 
    e.metadata[2] && 
    typeof e.metadata[2] === 'string' && 
    e.metadata[2].includes("Lifetime")
  );
  
  if (nearestEntity) {
    setTimeout(() => bot.activateEntityAt(nearestEntity, nearestEntity.position), 1000);
  } else {
    console.log("No leaderboard entity found.");
  }
}

/**
 * Attempt to reconnect the bot with exponential backoff
 */
function attemptReconnect() {
  if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
    reconnectAttempts++;
    const delay = RECONNECT_DELAY * Math.pow(2, reconnectAttempts - 1);
    
    console.log(`Reconnect attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} in ${delay/1000} seconds`);
    
    setTimeout(() => {
      console.log("Attempting to reconnect bot...");
      startBot();
    }, delay);
  } else {
    console.error('Max reconnection attempts reached. Please restart manually.');
  }
}

/**
 * Start or restart the Minecraft bot
 */
function startBot() {
  if (mcbot) {
    try {
      mcbot.end();
    } catch (e) {
      console.error('Error ending previous bot instance:', e);
    }
  }
  
  console.log("Starting new bot instance...");
  mcbot = createBot();
  reconnectAttempts = 0;
  
  return mcbot;
}

// Clean old data periodically
setInterval(() => {
  const now = Date.now();
  const MAX_DATA_AGE = 60 * 60 * 1000; // 1 hour
  
  Object.keys(top).forEach(key => {
    if (now - top[key].lastUpdate > MAX_DATA_AGE) {
      console.log(`Data for ${key} is stale. Marking for refresh.`);
      top[key].lastUpdate = 0; // Mark as needing refresh
    }
  });
  
  // Clear expired cache entries (although this is handled by node-cache automatically)
  const stats = cache.getStats();
  console.log(`Cache stats: ${stats.keys} keys, ${stats.hits} hits, ${stats.misses} misses, hit rate: ${stats.hits/(stats.hits+stats.misses || 1)*100}%`);
}, 15 * 60 * 1000); // Check every 15 minutes

// API ROUTES

// Documentation endpoint
app.get("/api/docs", (req, res) => {
  const cacheKey = "api_docs";
  const cachedDocs = cache.get(cacheKey);
  
  if (cachedDocs) {
    return res.json(cachedDocs);
  }
  
  const docs = {
    endpoints: [
      {
        path: "/api/mc/top",
        method: "GET",
        description: "Get Minecraft leaderboard data",
        parameters: {
          response: {
            type: "string",
            description: "Response format (json or image)",
            default: "json"
          },
          duration: {
            type: "string",
            description: "Leaderboard duration (LIFETIME, monthly, weekly)",
            default: "monthly"
          },
          limit: {
            type: "integer",
            description: "Number of results to return (1-100)",
            default: 10
          },
          page: {
            type: "integer",
            description: "Page number for pagination",
            default: 1
          },
          sortBy: {
            type: "string",
            description: "Sort results by (top, username, time)",
            default: "top"
          },
          guild: {
            type: "string",
            description: "Filter results by guild name",
            optional: true
          } 
        }
      },
      {
        path: "/api/mc/guilds",
        method: "GET",
        description: "Get list of guilds from leaderboard data",
        parameters: {
          duration: {
            type: "string",
            description: "Leaderboard duration (LIFETIME, monthly, weekly)",
            default: "monthly"
          }
        }
      },
      {
        path: "/api/health",
        method: "GET",
        description: "Check API and bot health status"
      },
      {
        path: "/api/cache/clear",
        method: "POST",
        description: "Clear the API cache (requires admin key)",
        parameters: {
          key: {
            type: "string",
            description: "Admin API key for authorization",
            required: true
          },
          target: {
            type: "string",
            description: "Specific cache to clear (all, leaderboard, images)",
            default: "all"
          }
        }
      }
    ]
  };
  
  cache.set(cacheKey, docs, 86400); // Cache for 24 hours
  return res.json(docs);
});

// Get leaderboard data with caching
app.get("/api/mc/top", async (req, res) => {
  // Extract query parameters with defaults
  const responseType = req.query.responseType?.toLowerCase() || 'json';
  const duration = req.query.duration?.toUpperCase() || 'MONTHLY';
  const filterGuild = req.query.guild || null;
  const limit = parseInt(req.query.limit) || 10;
  const page = parseInt(req.query.page) || 1;
  const sortBy = req.query.sortBy || 'top';
  
  // Validate parameters
  if (!['json', 'image'].includes(responseType)) {
    return res.status(400).json({ error: 'Invalid response type. Must be "json" or "image"' });
  }
  
  if (!['LIFETIME', 'MONTHLY', 'WEEKLY'].includes(duration)) {
    return res.status(400).json({ error: 'Invalid duration. Must be "lifetime", "monthly", or "weekly"' });
  }
  
  // Generate cache key based on request parameters
  const cacheKey = `leaderboard_${duration}_${responseType}_${limit}_${page}_${sortBy}_${filterGuild || 'all'}`;
  
  // Check cache first if not bypassing
  if (!bypassCache) {
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      if (responseType === 'json') {
        return res.json({
          success: true,
          cached: true,
          data: cachedData
        });
      } else if (responseType === 'image') {
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=300'); // Cache for 5 minutes
        return res.send(cachedData);
      }
    }
  }
  
  // Get the requested leaderboard data
  if (!top[duration]) {
    return res.status(404).json({ error: `No leaderboard data available for ${duration}` });
  }

  const leaderboardData = top[duration];
  // Check if data exists and is recent
  const dataAge = Date.now() - leaderboardData.lastUpdate;
  const isDataStale = !leaderboardData.lastUpdate || dataAge > 5 * 60 * 1000; // 5 minutes
  
  if (isDataStale) {
    console.log(`Stale data for ${duration}, triggering refresh`);
    triggerLeaderboardRefresh(duration);
  }
  
  // Process the users data - apply filtering, sorting, and pagination
  let filteredUsers = [...leaderboardData.users || []];
  
  // Apply guild filter if provided
  if (filterGuild) {
    filteredUsers = filteredUsers.filter(player => 
      player.guild && player.guild.toLowerCase().includes(filterGuild.toLowerCase())
    );
  }
  
  // Apply sorting
  switch(sortBy) {
    case 'username':
      filteredUsers.sort((a, b) => a.username.localeCompare(b.username));
      break;
    case 'time':
      filteredUsers.sort((a, b) => {
        const aHours = a.timeUnit === 'Days' ? a.hour * 24 : a.hour;
        const bHours = b.timeUnit === 'Days' ? b.hour * 24 : b.hour;
        return bHours - aHours; // Descending order
      });
      break;
    case 'top':
    default:
      filteredUsers.sort((a, b) => a.top - b.top); // Already sorted by top, but ensure it
  }
  
  // Apply pagination
  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;
  const paginatedUsers = filteredUsers.slice(startIndex, endIndex);
  
  // Clean and enhance player data
  const processedUsers = paginatedUsers.map(player => ({
    ...player,
    // Clean username of color codes for display if needed
    cleanUsername: player.username.replace(/§[0-9a-fk-or]/g, ''),
    // Convert time to hours for consistency
    hoursPlayed: player.timeUnit === 'Days' ? player.hour * 24 : player.hour
  }));
  
  // Prepare response data
  const responseData = {
    duration,
    lastUpdated: leaderboardData.lastUpdate ? new Date(leaderboardData.lastUpdate).toISOString() : null,
    isStale: isDataStale,
    pagination: {
      page,
      limit,
      totalItems: filteredUsers.length,
      totalPages: Math.ceil(filteredUsers.length / limit)
    },
    filter: filterGuild ? { guild: filterGuild } : null,
    sortBy,
    players: processedUsers
  };
  
  // Cache the response for future requests
  cache.set(cacheKey, responseData, 300); // Cache for 5 minutes
  
  // Response based on type
  if (responseType === 'json') {
    return res.json({
      success: true,
      cached: false,
      data: responseData
    });
  } else if (responseType === 'image') {
    try {
      // Generate image using the design.js module
      const imageBuffer = await createLeaderboard(
        processedUsers, 
        duration, 
        new Date(leaderboardData.lastUpdate || Date.now()),
        filterGuild
      );
      
      // Cache the image buffer
      cache.set(cacheKey, imageBuffer, 300); // Cache for 5 minutes
      
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=300'); // Cache for 5 minutes
      return res.send(imageBuffer);
    } catch (error) {
      console.error('Error generating leaderboard image:', error);
      return res.status(500).json({ error: 'Failed to generate leaderboard image' });
    }
  }
});

// Get guilds from leaderboard data
app.get("/api/mc/guilds", async (req, res) => {
  const duration = req.query.duration?.toUpperCase() || 'MONTHLY';
  
  // Validate parameters
  if (!['LIFETIME', 'MONTHLY', 'WEEKLY'].includes(duration)) {
    return res.status(400).json({ error: 'Invalid duration. Must be "lifetime", "monthly", or "weekly"' });
  }
  
  // Generate cache key
  const cacheKey = `guilds_${duration}`;
  
  // Check cache first
  if (!bypassCache) {
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      return res.json({
        success: true,
        cached: true,
        data: cachedData
      });
    }
  }
  
  // Get the requested leaderboard data
  if (!top[duration] || !top[duration].users || top[duration].users.length === 0) {
    return res.status(404).json({ 
      error: `No leaderboard data available for ${duration}`,
      refresh: triggerLeaderboardRefresh(duration) ? "refresh triggered" : "refresh failed"
    });
  }
  
  // Extract and count guilds
  const guilds = {};
  top[duration].users.forEach(player => {
    if (player.guild) {
      const guildName = player.guild.replace(/§[0-9a-fk-or]/g, '');
      if (!guilds[guildName]) {
        guilds[guildName] = { count: 0, totalHours: 0, members: [] };
      }
      
      const hours = player.timeUnit === 'Days' ? player.hour * 24 : player.hour;
      guilds[guildName].count++;
      guilds[guildName].totalHours += hours;
      guilds[guildName].members.push({
        username: player.username.replace(/§[0-9a-fk-or]/g, ''),
        rank: player.top,
        hours: hours
      });
    }
  });
  
  // Convert to array and sort by member count
  const guildArray = Object.entries(guilds).map(([name, data]) => ({
    name,
    memberCount: data.count,
    totalHours: data.totalHours,
    averageHours: Math.round(data.totalHours / data.count),
    members: data.members
  })).sort((a, b) => b.memberCount - a.memberCount);
  
  const responseData = {
    duration,
    lastUpdated: top[duration].lastUpdate ? new Date(top[duration].lastUpdate).toISOString() : null,
    totalGuilds: guildArray.length,
    guilds: guildArray
  };
  
  // Cache the response
  cache.set(cacheKey, responseData, 600); // Cache for 10 minutes
  
  return res.json({
    success: true,
    cached: false,
    data: responseData
  });
});

// Cache control endpoint - allows admin to clear cache
app.post("/api/cache/clear", (req, res) => {
  const { key, target } = req.body;
  
  // Verify API key (you should set this in your environment variables)
  const adminKey = process.env.ADMIN_API_KEY || "BLOCKSMC_LEADERBOARD_API_ADMIN_SECRET_KEY";
  if (key !== adminKey) {
    return res.status(401).json({ error: "Unauthorized. Invalid API key." });
  }
  
  // Clear specified cache
  switch (target?.toLowerCase()) {
    case "leaderboard":
      // Clear only leaderboard cache
      Object.keys(cache.keys()).forEach(cacheKey => {
        if (cacheKey.startsWith('leaderboard_')) {
          cache.del(cacheKey);
        }
      });
      return res.json({ success: true, message: "Leaderboard cache cleared" });
    
    case "guilds":
      // Clear only guilds cache
      Object.keys(cache.keys()).forEach(cacheKey => {
        if (cacheKey.startsWith('guilds_')) {
          cache.del(cacheKey);
        }
      });
      return res.json({ success: true, message: "Guilds cache cleared" });
      
    case "images":
      // Clear only image cache
      Object.keys(cache.keys()).forEach(cacheKey => {
        if (cacheKey.includes('_image_')) {
          cache.del(cacheKey);
        }
      });
      return res.json({ success: true, message: "Image cache cleared" });
      
    case "all":
    default:
      // Clear entire cache
      cache.flushAll();
      return res.json({ success: true, message: "All cache cleared" });
  }
});

// Health check endpoint with enhanced cache stats
app.get('/api/health', (req, res) => {
  const now = Date.now();
  const botStatus = mcbot && mcbot.entity ? 'connected' : 'disconnected';
  const cacheStats = cache.getStats();
  
  // Check data freshness
  const dataStatus = {};
  Object.keys(top).forEach(key => {
    const dataAge = now - top[key].lastUpdate;
    dataStatus[key] = {
      lastUpdate: top[key].lastUpdate ? new Date(top[key].lastUpdate).toISOString() : null,
      age: top[key].lastUpdate ? Math.floor(dataAge / 1000) + ' seconds' : 'never updated',
      fresh: top[key].lastUpdate && dataAge < 10 * 60 * 1000, // Consider fresh if < 10 minutes old
      playerCount: (top[key].users || []).length
    };
  });
  
  return res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: {
      rss: Math.round(process.memoryUsage().rss / 1024 / 1024) + ' MB',
      heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + ' MB',
      heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB'
    },
    bot: {
      status: botStatus,
      reconnectAttempts
    },
    cache: {
      keys: cacheStats.keys,
      hits: cacheStats.hits,
      misses: cacheStats.misses,
      hitRate: cacheStats.hits + cacheStats.misses > 0 
        ? Math.round((cacheStats.hits / (cacheStats.hits + cacheStats.misses)) * 100) + '%' 
        : 'N/A',
      ksize: cacheStats.ksize,
      vsize: cacheStats.vsize
    },
    data: dataStatus
  });
});

// Player search endpoint
app.get('/api/mc/search', (req, res) => {
  const query = req.query.q?.toLowerCase();
  const duration = req.query.duration?.toUpperCase() || 'MONTHLY';
  
  if (!query || query.length < 2) {
    return res.status(400).json({ error: 'Search query must be at least 2 characters' });
  }
  
  // Validate parameters
  if (!['LIFETIME', 'MONTHLY', 'WEEKLY'].includes(duration)) {
    return res.status(400).json({ error: 'Invalid duration. Must be "lifetime", "monthly", or "weekly"' });
  }
  
  // Generate cache key
  const cacheKey = `search_${duration}_${query}`;
  
  // Check cache first
  const cachedData = cache.get(cacheKey);
  if (cachedData) {
    return res.json({
      success: true,
      cached: true,
      data: cachedData
    });
  }
  
  // Get the requested leaderboard data
  if (!top[duration] || !top[duration].users || top[duration].users.length === 0) {
    return res.status(404).json({ error: `No leaderboard data available for ${duration}` });
  }
  
  // Search for players
  const cleanUsername = (username) => username.replace(/§[0-9a-fk-or]/g, '').toLowerCase();
  
  const matches = top[duration].users.filter(player => {
    return cleanUsername(player.username).includes(query) || 
           (player.guild && player.guild.toLowerCase().includes(query));
  });
  
  // Process results
  const results = matches.map(player => ({
    username: player.username,
    cleanUsername: cleanUsername(player.username),
    rank: player.top,
    hours: player.timeUnit === 'Days' ? player.hour * 24 : player.hour,
    timeUnit: player.timeUnit,
    guild: player.guild || null
  }));
  
  const responseData = {
    query,
    duration,
    totalResults: results.length,
    results
  };
  
  // Cache the response
  cache.set(cacheKey, responseData, 300); // Cache for 5 minutes
  
  return res.json({
    success: true,
    cached: false,
    data: responseData
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ 
    error: 'Internal server error', 
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

/**
 * Trigger a refresh of a specific leaderboard
 * @param {string} type - The leaderboard type to refresh (LIFETIME, MONTHLY, WEEKLY)
 * @returns {boolean} Success status of the refresh trigger
 */
function triggerLeaderboardRefresh(type) {
  if (!mcbot || !mcbot.entity) {
    console.log("Bot not connected, cannot refresh leaderboard");
    startBot();
    return false;
  }
  
  // Find a leaderboard entity to interact with
  const entity = mcbot.nearestEntity((e) => 
    e.displayName === "Armor Stand" && 
    e.metadata && 
    e.metadata[2] && 
    typeof e.metadata[2] === 'string' && 
    e.metadata[2].includes("Lifetime")
  );
  
  if (entity) {
    // Select the appropriate leaderboard based on type
    const targetState = {
      "LIFETIME": "§r§6[§6§l§nLifetime§6] §f[Monthly] [Weekly]",
      "MONTHLY": "§r§f[Lifetime] §6[§6§l§nMonthly§6] §f[Weekly]",
      "WEEKLY": "§r§f[Lifetime] [Monthly] §6[§6§l§nWeekly§6]"
    }[type];
    
    // If current state is not the target, click to change it
    if (entity.metadata[2] !== targetState) {
      console.log(`Switching to ${type} leaderboard`);
      mcbot.activateEntityAt(entity, entity.position);
    }
    return true;
  } else {
    console.log("No leaderboard entity found for refresh");
    return false;
  }
}

// Start the server
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  startBot();
});

// Add proper server shutdown
server.timeout = 30000; // 30 second timeout

// Handle graceful shutdown
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

function shutdown() {
  console.log('Shutting down gracefully...');
  
  // First close the server to stop accepting new connections
  server.close(() => {
    console.log('HTTP server closed');
    
    // Then disconnect the Minecraft bot
    if (mcbot) {
      try {
        mcbot.end('Server shutting down');
        console.log('Minecraft bot disconnected');
      } catch (err) {
        console.error('Error disconnecting bot:', err);
      }
    }
    
    // Finally exit the process
    console.log('Shutdown complete, exiting process');
    process.exit(0);
  });
  
  // If server hasn't closed in 10 seconds, force exit
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}