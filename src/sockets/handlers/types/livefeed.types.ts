// sockets/handlers/types/livefeed.types.ts
export interface LiveFeedUser {
  id: string;
  name: string;
  role: string;
  avatar?: string;
}

export interface LiveFeedReaction {
  emoji: string;
  count: number;
  users: string[];
}

export interface LiveFeed {
  _id: string;
  eventId: string;
  author: LiveFeedUser;
  content: string;
  type: 'TEXT' | 'ANNOUNCEMENT' | 'UPDATE';
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  reactions: LiveFeedReaction[];
  isPinned: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Event payload types
export interface JoinEventData {
  eventId: string;
}

export interface CreatePostData {
  eventId: string;
  content: string;
  type?: 'TEXT' | 'ANNOUNCEMENT' | 'UPDATE';
  priority?: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface ReactionData {
  postId: string;
  emoji: string;
}

export interface PinData {
  postId: string;
  pin: boolean;
}

export interface DeleteData {
  postId: string;
}

// Event response types
export interface LiveFeedJoinedResponse {
  eventId: string;
}

export interface LiveFeedsResponse {
  eventId: string;
  posts: LiveFeed[];
}

export interface LiveFeedResponse {
  post: LiveFeed;
}

export interface LiveFeedReactionResponse {
  postId: string;
  reactions: LiveFeedReaction[];
}

export interface LiveFeedPinResponse {
  postId: string;
  isPinned: boolean;
}

export interface LiveFeedDeleteResponse {
  postId: string;
  deletedBy?: LiveFeedUser;
}

export interface LiveFeedErrorResponse {
  message: string;
  code?: string;
}