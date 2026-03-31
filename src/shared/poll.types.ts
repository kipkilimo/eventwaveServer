// This file is shared between server and client

export interface Poll {
  id: string;
  eventId: string;
  question: string;
  description?: string;
  options: PollOption[];
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  closesAt?: Date;
  isActive: boolean;
  isAnonymous: boolean;
  allowMultiple: boolean;
  maxVotes?: number;
  resultsVisible: boolean;
}

export interface PollOption {
  id: string;
  text: string;
  imageUrl?: string;
  order: number;
}

export interface PollVote {
  id: string;
  pollId: string;
  optionId: string;
  userId: string;
  votedAt: Date;
  metadata?: Record<string, any>;
}

export interface PollResult {
  pollId: string;
  totalVotes: number;
  options: Record<string, number>; // optionId -> count
  updatedAt: Date;
}

// Socket events
export interface PollClientToServerEvents {
  joinPoll: (data: { eventId: string; pollId?: string }) => void;
  leavePoll: (eventId: string) => void;
  'poll:create': (pollData: Partial<Poll>) => void;
  'poll:vote': (voteData: { pollId: string; optionId: string; userId: string }) => void;
  'poll:close': (pollId: string) => void;
  'poll:update': (poll: Poll) => void;
  'poll:delete': (pollId: string) => void;
}

export interface PollServerToClientEvents {
  pollCreated: (poll: Poll) => void;
  pollUpdated: (poll: Poll) => void;
  pollDeleted: (pollId: string) => void;
  pollClosed: (poll: Poll) => void;
  pollState: (poll: Poll) => void;
  pollResults: (results: PollResult) => void;
  voteConfirmed: (vote: PollVote) => void;
  error: (error: { message: string; tool: string; timestamp: string }) => void;
}