# BlocksMC Leaderboard API

A high-performance API service for collecting, caching, and serving BlocksMC Minecraft server leaderboard data.

[![GitHub issues](https://img.shields.io/github/issues/9de/blocksmc-leaderboard-api)](https://github.com/9de/blocksmc-leaderboard-api/issues)
[![License](https://img.shields.io/github/license/9de/blocksmc-leaderboard-api)](https://github.com/9de/blocksmc-leaderboard-api/blob/main/LICENSE)

## Overview

This project uses Mineflayer to automatically collect player statistics from the BlocksMC Minecraft server. It creates a RESTful API that serves this data with efficient caching mechanisms for optimal performance. The API can return data in both JSON and image formats.

## Features

- ✅ Real-time leaderboard data collection from BlocksMC
- ✅ Multiple leaderboard types (Lifetime, Monthly, Weekly)
- ✅ Efficient caching system with customizable TTLs
- ✅ Both JSON and image response formats
- ✅ Sorting, filtering, and pagination support
- ✅ Guild statistics and player search
- ✅ Health monitoring endpoint
- ✅ Rate limiting and security features
- ✅ Graceful error handling and shutdown
- ✅ Docker support

## Installation

### Prerequisites

- Node.js 16.x or higher
- npm or yarn

### Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/9de/blocksmc-leaderboard-api.git
   cd blocksmc-leaderboard-api
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file in the root directory with the following content:
   ```
   PORT=3000
   MC_USERNAME=your_minecraft_username
   MC_PASSWORD=your_minecraft_password
   MC_HOST=ccc.blocksmc.com
   MC_VERSION=1.8.9
   ADMIN_API_KEY=your_secure_admin_key
   NODE_ENV=production
   ```

## Usage

### Starting the Server

Development mode with auto-reload:
```bash
npm run dev
```

Production mode:
```bash
npm start
```

### API Endpoints

#### Get Leaderboard Data
```
GET /api/mc/top
```

Query Parameters:
- `responseType`: Format of the response (`json` or `image`). Default: `json`
- `duration`: Leaderboard type (`LIFETIME`, `MONTHLY`, `WEEKLY`). Default: `MONTHLY`
- `limit`: Number of results to return. Default: `10`
- `page`: Page number for pagination. Default: `1`
- `sortBy`: Field to sort by (`top`, `username`, `time`). Default: `top`
- `guild`: Filter by guild name. Optional

#### Get Guild Information
```
GET /api/mc/guilds
```

Query Parameters:
- `duration`: Leaderboard type (`LIFETIME`, `MONTHLY`, `WEEKLY`). Default: `MONTHLY`

#### Search Players
```
GET /api/mc/search
```

Query Parameters:
- `q`: Search query (min 2 characters)
- `duration`: Leaderboard type (`LIFETIME`, `MONTHLY`, `WEEKLY`). Default: `MONTHLY`

#### Clear Cache (Admin Only)
```
POST /api/cache/clear
```

Body Parameters:
- `key`: Admin API key for authorization
- `target`: Cache target to clear (`all`, `leaderboard`, `guilds`, `images`). Default: `all`

#### Check API Health
```
GET /api/health
```

#### API Documentation
```
GET /api/docs
```

## Docker Support

Build the Docker image:
```bash
npm run docker:build
```

Run the Docker container:
```bash
npm run docker:run
```

Or use standard Docker commands:
```bash
docker build -t blocksmc-leaderboard-api .
docker run -p 3000:3000 --env-file .env blocksmc-leaderboard-api
```

## Development

### Code Structure

- `index.js`: Main application entry point
- `assets/design.js`: Image generation functionality
- `.env`: Environment configuration

### Adding New Features

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-new-feature`
3. Commit your changes: `git commit -am 'Add some feature'`
4. Push to the branch: `git push origin feature/my-new-feature`
5. Submit a pull request

## Performance Considerations

- Data is cached for 5 minutes by default
- Response compression is enabled
- Rate limiting prevents abuse
- Memory usage is monitored in health endpoint

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Author

[9de](https://github.com/9de)

## Acknowledgments

- [Mineflayer](https://github.com/PrismarineJS/mineflayer) for Minecraft connectivity
- [Express](https://expressjs.com/) for the API framework
- [node-cache](https://www.npmjs.com/package/node-cache) for efficient caching
