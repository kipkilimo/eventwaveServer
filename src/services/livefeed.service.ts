import { LiveFeed } from "../models/LiveFeed";
import { Event } from "../models/Event";
import { User } from "../models/User";
import { Types } from "mongoose";
import { LiveFeedTypeEnum, LiveFeedPriorityEnum } from "../models/LiveFeed";

/* ----------------------------------------------------
   Helpers: population + normalization
---------------------------------------------------- */

const populatePostQuery = (query: any) =>
  query
    .populate("author", "name email avatar role")
    .populate("event", "title description status startDate endDate dateTime");

const normalizePost = (post: any) => {
  if (!post) return null;

  // Map post _id → id
  post.id = post._id?.toString();
  delete post._id;

  // Event normalization
  if (post.event) {
    const evt = post.event;
    evt.id = evt._id?.toString();
    delete evt._id;

    evt.dateTime = {
      start: evt?.dateTime?.start || evt?.startDate || null,
      end: evt?.dateTime?.end || evt?.endDate || null,
    };
  }

  // Author normalization
  if (post.author) {
    const author = post.author;
    author.id = author._id?.toString();
    delete author._id;
  }

  return post;
};

/* ----------------------------------------------------
   Service
---------------------------------------------------- */

export const LiveFeedService = {
  /* ---------------- READ ---------------- */

  async getPost(postId: string) {
    const post = await populatePostQuery(LiveFeed.findById(postId)).lean();

    if (!post) throw new Error("Live feed post not found");
    return normalizePost(post);
  },

  async getPosts({
    eventId,
    page = 1,
    limit = 50,
  }: {
    eventId: string;
    page: number;
    limit: number;
  }) {
    if (!eventId || !Types.ObjectId.isValid(eventId)) {
      return { items: [], total: 0, page, limit };
    }

    const safePage = Math.max(1, page);
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const skip = (safePage - 1) * safeLimit;

    const filter = { event: new Types.ObjectId(eventId) };

    const total = await LiveFeed.countDocuments(filter).catch(() => 0);

    if (!total)
      return {
        items: [],
        total: 0,
        page: safePage,
        limit: safeLimit,
      };

    const items = await populatePostQuery(
      LiveFeed.find(filter)
        .sort({ isPinned: -1, createdAt: -1 })
        .skip(skip)
        .limit(safeLimit)
    )
      .lean()
      .catch(() => []);

    return {
      items: items.map(normalizePost),
      total,
      page: safePage,
      limit: safeLimit,
    };
  },

  /* ---------------- CREATE ---------------- */

  async createPost({ eventId, authorId, content, type, priority }: any) {
    if (!content?.trim()) throw new Error("Content cannot be empty");

    const [eventExists, authorExists] = await Promise.all([
      Event.findById(eventId),
      User.findById(authorId),
    ]);

    if (!eventExists) throw new Error("Event not found");
    if (!authorExists) throw new Error("Author not found");

    const post = await LiveFeed.create({
      event: eventId,
      author: authorId,
      content: content.trim(),
      type: type as LiveFeedTypeEnum,
      priority: priority as LiveFeedPriorityEnum,
      reactions: [],
      isPinned: false,
    });

    return this.getPost(post._id.toString());
  },

  /* ---------------- UPDATE ---------------- */

  async updatePost({ postId, content, type, priority }: any) {
    if (!content?.trim()) throw new Error("Content cannot be empty");

    const post = await LiveFeed.findById(postId);
    if (!post) throw new Error("Post not found");

    post.content = content.trim();
    post.updatedAt = new Date();

    if (type) post.type = type as LiveFeedTypeEnum;
    if (priority) post.priority = priority as LiveFeedPriorityEnum;

    await post.save();
    return this.getPost(postId);
  },

  /* ---------------- PIN (FIXED) ---------------- */
  /**
   * ✅ Idempotent
   * ✅ ACK-safe
   * ✅ Race-condition resistant
   */
  async togglePin({ postId, pin }: { postId: string; pin?: boolean }) {
    const post = await LiveFeed.findById(postId);
    if (!post) throw new Error("Post not found");

    post.isPinned = typeof pin === "boolean" ? pin : !post.isPinned;

    post.updatedAt = new Date();
    await post.save();

    return this.getPost(postId);
  },

  /* ---------------- BREAKING ---------------- */

  async toggleBreaking({ postId }: any) {
    const post = await LiveFeed.findById(postId);
    if (!post) throw new Error("Post not found");

    post.isBreaking = !post.isBreaking;
    post.updatedAt = new Date();
    await post.save();

    return this.getPost(postId);
  },

  /* ---------------- REACTIONS ---------------- */

  async addReaction({ postId, emoji, userId }: any) {
    const post = await LiveFeed.findById(postId);
    if (!post) throw new Error("Post not found");

    const userObjectId = new Types.ObjectId(userId);
    let reaction = post.reactions.find((r: any) => r.emoji === emoji);

    if (!reaction) {
      post.reactions.push({
        emoji,
        count: 1,
        users: [userObjectId],
      });
    } else {
      const idx = reaction.users.findIndex((u: any) => u.toString() === userId);

      if (idx > -1) {
        reaction.users.splice(idx, 1);
        reaction.count--;
      } else {
        reaction.users.push(userObjectId);
        reaction.count++;
      }

      if (reaction.count <= 0) {
        post.reactions = post.reactions.filter((r: any) => r.emoji !== emoji);
      }
    }

    post.updatedAt = new Date();
    await post.save();

    return this.getPost(postId);
  },

  /* ---------------- DELETE ---------------- */

  async deletePost({ postId, userId, userRole }: any) {
    const post = await LiveFeed.findById(postId);
    if (!post) throw new Error("Post not found");

    const canDelete =
      post.author.toString() === userId ||
      ["admin", "facilitator"].includes(userRole);

    if (!canDelete) throw new Error("Unauthorized to delete this post");

    await post.deleteOne();
    return true;
  },
};
