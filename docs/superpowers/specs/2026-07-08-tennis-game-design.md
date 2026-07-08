# 3D 网球对战游戏 — 设计文档

## 概述

一款 3D 俯视斜角视角的多人网络对战网球游戏，采用服务器权威架构。玩家创建或加入房间，通过 WebSocket 进行实时对战。

## 技术栈

| 层级 | 技术 |
|---|---|
| 3D 渲染 | Three.js |
| 物理引擎 | 自定义轻量物理（服务器端运行） |
| 后端 | Node.js + Express |
| WebSocket | ws 库 |
| 端口 | 5000 |
| 部署 | 单进程（前端静态 + 后端 + WebSocket 合一） |

## 架构

```
云服务器 (端口5000)
  ├── Express          — 提供静态页面、房间 REST API
  ├── ws WebSocket     — 实时输入/状态通信
  ├── Room Manager     — 房间创建/加入/销毁
  └── Game Loop        — 60 tick/s 服务器权威模拟
       ├── 物理引擎     — 球体运动、碰撞、弹跳、旋转
       └── 规则引擎     — 网球计分、发球轮换、胜负判定
            ↕ WebSocket
      玩家 A (浏览器)        玩家 B (浏览器)
      Three.js 渲染          Three.js 渲染
      WASD + J/K/L/U 操作   方向键 + J/K/L/U 操作
```

## 3D 场景

### 场景元素

| 元素 | 实现方式 |
|---|---|
| 球场 | Three.js PlaneGeometry，深绿/浅绿条纹交替 |
| 边界线 | LineSegments 白色线条 |
| 球网 | 半透明网格平面，横跨球场中线 |
| 球员 | 简单 3D 体（BoxGeometry / CylinderGeometry 组合：躯干 + 球拍） |
| 网球 | SphereGeometry，亮黄色 |
| 视角 | PerspectiveCamera，固定 45° 俯视斜角 |
| 光照 | AmbientLight + DirectionalLight |

### 颜色方案

- 场地条纹: `#2E7D32` / `#388E3C`
- 边界线: `#FFFFFF`
- 球网: rgba(255,255,255,0.3)
- 网球: `#D4E157`
- 球员1: `#E53935`（红色）
- 球员2: `#1E88E5`（蓝色）

## 游戏物理（服务器权威）

### 球体运动

每帧计算:
1. 位置 += 速度 × dt
2. 速度.y -= 重力系数 × dt
3. 速度 ×= 空气阻力 (0.998)
4. 球旋转影响弹跳后方向

### 碰撞

| 碰撞对象 | 处理 |
|---|---|
| 球 → 地面 | 弹跳，弹性系数 0.7 |
| 球 → 球网 | 触网 → 球速归零弹回（挂网） |
| 球 → 球拍 | 按击球类型赋予新速度和旋转 |
| 球 → 边界 | 出界 → 对方得分 |

## 击球类型

| 击球 | 按键 | 速度 | 弹道 | 旋转效果 |
|---|---|---|---|---|
| 平击 | J | 快 | 低平 | 无旋转 |
| 上旋 | K | 中快 | 较高 | 落地后加速前冲 |
| 下旋 | L | 慢 | 低平 | 落地后减速滑行 |
| 截击 | U | 中 | 低平 | 网前快速回击，角度刁 |

## 网球规则

- 单局计分: 0 → 15 → 30 → 40 → 赢局
- Deuce (40-40): 连赢 2 分
- 盘: 先赢 6 局且领先 2 局，或抢七
- 每局轮换发球
- 两次发球机会（一发/二发）
- 比赛为一盘定胜负

## 网络协议

### 房间流程

1. 玩家 A 创建房间 → 获取 5 位房间码
2. 玩家 B 输入房间码加入
3. 双方收到 `game_start` 通知
4. 3 秒倒计时 → 比赛开始

### WebSocket 消息

**客户端 → 服务器**
```json
{ "type": "input", "seq": 12345, "keys": { "up": true, "down": false, "left": false, "right": true, "hit_flat": false, "hit_topspin": false, "hit_slice": false, "hit_volley": false } }
```

**服务器 → 客户端**
```json
{ "type": "state", "tick": 67890, "ball": { "x": 0, "y": 0.5, "z": 0, "vx": 0, "vy": 0, "vz": 0, "rotation": 0 }, "player1": { "x": 0, "z": -5, "isServing": true }, "player2": { "x": 0, "z": 5, "isServing": false }, "score": { "p1_games": 0, "p1_points": "0", "p2_games": 0, "p2_points": "0", "serving": 1 }, "phase": "playing" }
```

### 同步策略

- 输入采样率: 客户端 30 帧/秒
- 状态广播: 服务器 30 帧/秒
- 物理模拟: 服务器 60 tick/s
- 客户端渲染: 线性插值平滑

## 文件结构

```
/root/tennis-sim/
├── server/
│   ├── index.js       # Express + WebSocket 入口 (端口5000)
│   ├── room.js        # 房间管理器
│   ├── game.js        # 游戏循环 60tick
│   ├── physics.js     # 球体物理
│   └── rules.js       # 网球规则
├── public/
│   ├── index.html     # 主页：创建/加入房间
│   ├── game.html      # 游戏页面：3D 场景
│   ├── game.js        # Three.js 场景初始化
│   ├── input.js       # 键盘监听
│   ├── network.js     # WebSocket 客户端
│   └── render.js      # 状态插值渲染
├── package.json
└── README.md
```

## 房间管理

- 房间码: 5 位字母数字
- 超时: 创建后 120 秒无人加入自动销毁
- 最大玩家: 2 人
- 断开重连: 10 秒内可重连（MVP 阶段不支持）