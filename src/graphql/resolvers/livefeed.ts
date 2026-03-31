import { LiveFeedService } from "../../services/livefeed.service";
import { LiveFeed } from "../../models/LiveFeed"; // Still needed for field resolvers
import { Event } from "../../models/Event"; // Still needed for field resolvers
import { User } from "../../models/User"; // Still needed for field resolvers
import { Types } from "mongoose";

/* -------------------------------------------------------
   FIELD RESOLVERS (Kept for compatibility with Mongoose objects)
   Note: If the service returns fully populated and leaned objects, 
   these might only be necessary for nested fields/transformations.
------------------------------------------------------- */
const LiveFeedFields = {
  id: (parent: any) => parent._id?.toString() || parent.id,
  // If the service fully populates these, this logic is often simplified/redundant,
  // but kept here as a fallback/structure standard.
  event: (parent: any) => parent.event,
  author: (parent: any) => parent.author,
  reactions: (parent: any) => parent.reactions || [],
  createdAt: (parent: any) => parent.createdAt,
  updatedAt: (parent: any) => parent.updatedAt,
};

/* -------------------------------------------------------
   QUERY RESOLVERS (Delegated to Service)
------------------------------------------------------- */
const Query = {
  async liveFeedPosts(
    _: any,
    {
      event: eventId,
      page = 1,
      limit = 50,
    }: { event: string; page?: number; limit?: number },
    context: any
  ) {
    try {
      const normalizedPage = Math.max(1, page);
      const normalizedLimit = Math.min(limit, 100);
      const skip = (normalizedPage - 1) * normalizedLimit;

      const [feeds, total] = await Promise.all([
        LiveFeed.find({ event: eventId })
          .sort({ createdAt: -1, priority: -1 })
          .populate({
            path: "author",
            model: "User",
            select: "_id name email role",
          })
          .skip(skip)
          .limit(normalizedLimit)
          .lean()
          .exec(),
        LiveFeed.countDocuments({ event: eventId }),
      ]);

      if (!feeds || feeds.length === 0) {
        return {
          items: [],
          total: 0,
          page: normalizedPage,
          limit: normalizedLimit,
          hasNextPage: false,
          __typename: "PaginatedLiveFeeds" as const,
        };
      }

      // Transform feeds based on your actual data structure
      const transformedFeeds = feeds.map((feed: any) => {
        // Handle author population
        let authorObject: {
          id: string;
          name: string;
          email: string;
          role: string;
          __typename: "User";
        };

        if (feed.author && typeof feed.author === "object" && feed.author._id) {
          // Author is populated as an object
          authorObject = {
            id: feed.author._id?.toString() || "",
            name: feed.author.name || "Unknown User",
            email: feed.author.email || "",
            role: feed.author.role || "user",
            __typename: "User" as const,
          };
        } else if (feed.author && typeof feed.author === "string") {
          // Author is just an ID string (shouldn't happen with populate, but just in case)
          authorObject = {
            id: feed.author,
            name: "Unknown User",
            email: "",
            role: "user",
            __typename: "User" as const,
          };
        } else {
          // No author found
          authorObject = {
            id: "",
            name: "Deleted User",
            email: "",
            role: "user",
            __typename: "User" as const,
          };
        }

        // Based on your sample data, create the LiveFeed object
        return {
          // Required fields from your sample
          id: feed._id?.toString() || "",
          event: {
            id: feed.event?.toString() || eventId,
            __typename: "Event" as const,
          },
          author: authorObject,
          content: feed.content || "",
          type: feed.type || "POST", // Use the actual value from your data
          priority: feed.priority || "MEDIUM", // From your sample: "HIGH"

          // Fields from your sample that might be in your GraphQL schema
          isPinned: feed.isPinned || false,
          isBreaking: feed.isBreaking || false,
          reactions: feed.reactions || [],

          // Fields that might be required but not in your sample
          // Add defaults for common LiveFeed fields
          media: feed.media || [],
          status: feed.status || "ACTIVE",
          visibility: feed.visibility || "PUBLIC",
          likes: feed.likes || 0,
          comments: feed.comments || 0,
          shares: feed.shares || 0,
          views: feed.views || 0,

          // Timestamps
          createdAt: feed.createdAt || new Date(),
          updatedAt: feed.updatedAt || new Date(),

          __typename: "LiveFeed" as const,
        };
      });

      return {
        items: transformedFeeds,
        total: total || 0,
        page: normalizedPage,
        limit: normalizedLimit,
        hasNextPage: skip + normalizedLimit < (total || 0),
        __typename: "PaginatedLiveFeeds" as const,
      };
    } catch (error: any) {
      console.error("Error fetching live feed posts:", error);
      throw new Error(`Failed to fetch live feed posts: ${error.message}`);
    }
  },
  // uses: LiveFeedService.getPost
  liveFeedPost: async (_: any, { id }: any) => {
    return LiveFeedService.getPost(id);
  },
};

/* -------------------------------------------------------
   MUTATION RESOLVERS (Delegated to Service)
------------------------------------------------------- */
const Mutation = {
  // uses: LiveFeedService.createPost
  createLiveFeed: async (_: any, { input }: any, { user }: any) => {
    if (!user) throw new Error("Unauthorized");
    return LiveFeedService.createPost({
      eventId: input.event,
      authorId: user.userId, // Use authenticated user ID
      content: input.content,
      type: input.type,
      priority: input.priority,
    });
  },

  // uses: LiveFeedService.updatePost
  updateLiveFeed: async (_: any, { id, input }: any, { user }: any) => {
    if (!user) throw new Error("Unauthorized");
    return LiveFeedService.updatePost({
      postId: id,
      userId: user.id,
      content: input.content,
      type: input.type,
      priority: input.priority,
      userRole: user.role,
    });
  },

  // uses: LiveFeedService.deletePost
  deleteLiveFeed: async (_: any, { id }: any, { user }: any) => {
    if (!user) throw new Error("Unauthorized");
    return LiveFeedService.deletePost({
      postId: id,
      userId: user.id,
      userRole: user.role,
    });
  },

  // uses: LiveFeedService.addReaction
  addReaction: async (_: any, { input }: any, { user }: any) => {
    if (!user) throw new Error("Unauthorized");
    return LiveFeedService.addReaction({
      postId: input.postId,
      emoji: input.emoji,
      userId: user.id,
    });
  },

  // uses: LiveFeedService.togglePin
  togglePinPost: async (_: any, { id }: any, { user }: any) => {
    return LiveFeedService.togglePin({
      postId: id,
    });
  },
};

/* -------------------------------------------------------
   EXPORT RESOLVERS
------------------------------------------------------- */
export const livefeedResolvers = {
  LiveFeed: LiveFeedFields,
  Query,
  Mutation,
};
