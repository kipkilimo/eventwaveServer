// sockets/handlers/analytics.handlers.ts
import { Socket } from "socket.io";
import { LiveFeed } from "../../models/LiveFeed";
import { namespaceManager } from "../services/namespace.manager";
import { Types } from "mongoose";

// Define types for analytics data
interface HourlyData {
  time: string;
  posts: number;
}

interface PostType {
  name: string;
  count: number;
}

interface SentimentData {
  type: string;
  percentage: number;
  icon: string;
  color: string;
}

interface TopPost {
  id: string;
  title: string;
  content: string;
  views: number;
  reactions: number;
  createdAt: Date;
  author: string;
}

interface RecentActivity {
  id: string;
  user: string;
  action: string;
  type: string;
  time: Date;
}

interface AnalyticsData {
  hourlyData: HourlyData[];
  postTypes: PostType[];
  sentiment: SentimentData[];
  topPosts: TopPost[];
  recentActivity: RecentActivity[];
  totalPosts: number;
  totalReactions: number;
  totalViews: number;
  totalShares: number;
  engagementRate: number;
  lastUpdated: string;
}

// Simplified interface that matches what comes from .lean()
interface IAnalyticsPost {
  _id: Types.ObjectId;
  content: string;
  type: string;
  reactions?: Array<any>;
  views?: number;
  shares?: number;
  createdAt: Date;
  author?: Types.ObjectId | any;
  // Add other fields that your LiveFeed model has
  priority?: string;
  isPinned?: boolean;
  isBreaking?: boolean;
  updatedAt?: Date;
  reactionCount?: number;
}

export const setupAnalyticsHandlers = (socket: Socket) => {
  const userId = socket.data.user?.id || "anonymous";
  const userName = socket.data.user?.name || "Anonymous";
  const userRole = socket.data.user?.role || "participant";

  // JOIN ANALYTICS ROOM
  socket.on(
    "analytics:join",
    async ({ eventId }: { eventId: string }, callback: Function) => {
      try {
        await socket.join(`analytics:${eventId}`);
        namespaceManager.registerConnection(socket, "analytics", eventId);

        console.log(`📊 ${userName} joined analytics:${eventId}`);

        // Send acknowledgement
        if (callback) {
          callback({
            success: true,
            eventId,
            message: `Joined analytics:${eventId}`,
          });
        }

        // Load initial analytics data
        const analyticsData = await getAnalyticsData(eventId);
        socket.emit("analytics:initial", analyticsData);
      } catch (error) {
        console.error("Error joining analytics:", error);
        const errorMessage =
          error instanceof Error ? error.message : "Failed to join analytics";

        if (callback) {
          callback({ success: false, error: errorMessage });
        }

        socket.emit("error", { message: errorMessage });
      }
    }
  );

  // GET INITIAL ANALYTICS DATA
  socket.on(
    "analytics:getInitial",
    async (
      data: { eventId: string; timeRange?: string },
      callback?: Function
    ) => {
      try {
        const { eventId, timeRange = "today" } = data;
        console.log(
          `📊 Loading initial analytics for ${eventId}, range: ${timeRange}`
        );

        const analyticsData = await getAnalyticsData(eventId, timeRange);

        if (callback) {
          callback({ success: true, ...analyticsData });
        }
      } catch (error) {
        console.error("Error getting analytics:", error);
        const errorMessage =
          error instanceof Error ? error.message : "Failed to load analytics";

        if (callback) {
          callback({ success: false, error: errorMessage });
        }
      }
    }
  );

  // REFRESH ANALYTICS
  socket.on(
    "analytics:refresh",
    async (
      data: { eventId: string; timeRange?: string },
      callback?: Function
    ) => {
      try {
        const { eventId, timeRange = "today" } = data;
        console.log(`🔄 Refreshing analytics for ${eventId}`);

        const analyticsData = await getAnalyticsData(eventId, timeRange);

        if (callback) {
          callback({ success: true, ...analyticsData });
        }

        // Broadcast update to all in analytics room
        socket
          .to(`analytics:${eventId}`)
          .emit("analytics:update", analyticsData);
      } catch (error) {
        console.error("Error refreshing analytics:", error);
        const errorMessage =
          error instanceof Error
            ? error.message
            : "Failed to refresh analytics";

        if (callback) {
          callback({ success: false, error: errorMessage });
        }
      }
    }
  );

  // LEAVE ANALYTICS ROOM
  socket.on(
    "analytics:leave",
    ({ eventId }: { eventId: string }, callback?: Function) => {
      socket.leave(`analytics:${eventId}`);
      namespaceManager.removeConnection(socket.id);

      if (callback) {
        callback({
          success: true,
          eventId,
          message: `Left analytics:${eventId}`,
        });
      }

      socket.emit("analytics:left", { eventId });
    }
  );

  // Handle disconnection
  socket.on("disconnect", () => {
    namespaceManager.removeConnection(socket.id);
  });
};

// Helper function to get analytics data
async function getAnalyticsData(
  eventId: string,
  timeRange: string = "today"
): Promise<AnalyticsData> {
  // Get posts for this event
  const posts = await LiveFeed.find({ eventId })
    .sort({ createdAt: -1 })
    .lean();

  // Calculate time range
  const now = new Date();
  const startTime = calculateStartTime(timeRange);

  // Filter and cast posts to our interface
  const filteredPosts: IAnalyticsPost[] = posts
    .filter((post: any): post is any => {
      // Simple filter to ensure we have required fields
      return post && 
             post.content && 
             post.type && 
             post.createdAt && 
             post._id;
    })
    .map((post: any) => {
      // Convert createdAt to Date if needed
      const createdAt = post.createdAt instanceof Date 
        ? post.createdAt 
        : new Date(post.createdAt);

      return {
        _id: post._id,
        content: post.content || '',
        type: post.type || 'TEXT',
        reactions: post.reactions || [],
        views: post.views || 0,
        shares: post.shares || 0,
        createdAt,
        author: post.author,
        // Include other fields if needed
        priority: post.priority,
        isPinned: post.isPinned,
        isBreaking: post.isBreaking,
        updatedAt: post.updatedAt,
        reactionCount: post.reactionCount || (post.reactions?.length || 0)
      } as IAnalyticsPost;
    })
    .filter(post => post.createdAt.getTime() >= startTime.getTime());

  // Calculate hourly data
  const hourlyData = calculateHourlyData(filteredPosts);

  // Calculate post types
  const postTypes = calculatePostTypes(filteredPosts);

  // Get top posts
  const topPosts = getTopPosts(filteredPosts);

  // Calculate sentiment (mock for now)
  const sentiment = calculateSentiment(filteredPosts);

  // Recent activity
  const recentActivity = getRecentActivity(filteredPosts);

  return {
    hourlyData,
    postTypes,
    sentiment,
    topPosts,
    recentActivity,
    totalPosts: filteredPosts.length,
    totalReactions: filteredPosts.reduce(
      (sum, post) => sum + (post.reactions?.length || 0),
      0
    ),
    totalViews: filteredPosts.reduce((sum, post) => sum + (post.views || 0), 0),
    totalShares: filteredPosts.reduce(
      (sum, post) => sum + (post.shares || 0),
      0
    ),
    engagementRate: calculateEngagementRate(filteredPosts),
    lastUpdated: now.toISOString(),
  };
}

function calculateStartTime(timeRange: string): Date {
  const now = new Date();

  switch (timeRange) {
    case "1h":
      return new Date(now.getTime() - 60 * 60 * 1000);
    case "24h":
      return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    case "today":
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    case "7d":
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    default:
      return new Date(now.getTime() - 24 * 60 * 60 * 1000);
  }
}

function calculateHourlyData(posts: IAnalyticsPost[]): HourlyData[] {
  const hourlyData: HourlyData[] = [];
  const now = new Date();

  // Get last 7 hours
  for (let i = 6; i >= 0; i--) {
    const hour = new Date(now.getTime() - i * 60 * 60 * 1000);
    const hourStart = new Date(
      hour.getFullYear(),
      hour.getMonth(),
      hour.getDate(),
      hour.getHours()
    );
    const hourEnd = new Date(hourStart.getTime() + 60 * 60 * 1000);

    const postsInHour = posts.filter((post) => {
      const postTime = post.createdAt;
      return postTime >= hourStart && postTime < hourEnd;
    });

    hourlyData.push({
      time: `${hour.getHours().toString().padStart(2, "0")}:00`,
      posts: postsInHour.length,
    });
  }

  return hourlyData;
}

function calculatePostTypes(posts: IAnalyticsPost[]): PostType[] {
  // Use actual types from your posts
  const allTypes = [...new Set(posts.map(post => post.type))];
  return allTypes.map((type) => ({
    name: type,
    count: posts.filter((post) => post.type === type).length,
  }));
}

function getTopPosts(posts: IAnalyticsPost[]): TopPost[] {
  return posts
    .map((post) => {
      // Get author string - handle ObjectId case
      let authorString = "Anonymous";
      if (post.author) {
        if (typeof post.author === 'string') {
          authorString = post.author;
        } else if (post.author instanceof Types.ObjectId) {
          authorString = "User " + post.author.toString().substring(0, 6);
        } else if (post.author.name) {
          authorString = post.author.name;
        }
      }

      return {
        id: post._id.toString(),
        title:
          post.content.substring(0, 50) + (post.content.length > 50 ? "..." : ""),
        content: post.content,
        views: post.views || 0,
        reactions: post.reactions?.length || 0,
        createdAt: post.createdAt,
        author: authorString,
      };
    })
    .sort((a, b) => {
      // Sort by engagement score
      const scoreA = a.views + (a.reactions * 10);
      const scoreB = b.views + (b.reactions * 10);
      return scoreB - scoreA;
    })
    .slice(0, 5);
}

function calculateSentiment(posts: IAnalyticsPost[]): SentimentData[] {
  // Mock sentiment calculation - you can implement real sentiment analysis here
  return [
    {
      type: "Positive",
      percentage: 65,
      icon: "mdi-emoticon-happy",
      color: "green",
    },
    {
      type: "Neutral",
      percentage: 25,
      icon: "mdi-emoticon-neutral",
      color: "grey",
    },
    {
      type: "Negative",
      percentage: 10,
      icon: "mdi-emoticon-sad",
      color: "red",
    },
  ];
}

function calculateEngagementRate(posts: IAnalyticsPost[]): number {
  if (posts.length === 0) return 0;
  
  const totalEngagement = posts.reduce(
    (sum, post) => sum + (post.reactions?.length || 0) + (post.shares || 0),
    0
  );

  const averageEngagement = totalEngagement / posts.length;
  return Math.min(Math.round(averageEngagement * 10), 100);
}

function getRecentActivity(posts: IAnalyticsPost[]): RecentActivity[] {
  return posts.slice(0, 5).map((post) => {
    // Get author string
    let authorString = "User";
    if (post.author) {
      if (typeof post.author === 'string') {
        authorString = post.author;
      } else if (post.author instanceof Types.ObjectId) {
        authorString = "User " + post.author.toString().substring(0, 6);
      } else if (post.author.name) {
        authorString = post.author.name;
      }
    }

    return {
      id: post._id.toString(),
      user: authorString,
      action: `published "${post.content.substring(0, 30)}..."`,
      type: "post",
      time: post.createdAt,
    };
  });
}