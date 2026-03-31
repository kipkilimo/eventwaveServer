import { gql } from "graphql-tag";

export const livefeedTypeDefs = gql`
  scalar Date

  enum LiveFeedType {
    TEXT
    ANNOUNCEMENT
    UPDATE
    ALERT
  }

  enum LiveFeedPriority {
    LOW
    MEDIUM
    HIGH
  }

  type Reaction {
    emoji: String!
    count: Int!
    users: [ID!]!
  }

  type LiveFeed {
    id: ID!
    event: Event!
    author: User!
    content: String!
    type: LiveFeedType! 
    priority: LiveFeedPriority!
    reactions: [Reaction!]!
    isPinned: Boolean!
    isBreaking: Boolean!
    createdAt: Date!
    updatedAt: Date!
  }

  input LiveFeedInput {
    author: ID!
    event: ID!
    content: String
    isBreaking: Boolean
    type: LiveFeedType = TEXT
    priority: LiveFeedPriority = MEDIUM
  }

  input ReactionInput {
    postId: ID!
    emoji: String!
  }

  type PaginatedLiveFeeds {
    items: [LiveFeed]
    total: Int!
    page: Int!
    limit: Int!
  }

  type Query {
    liveFeedPosts(
      event: ID!
      page: Int = 1
      limit: Int = 50
    ): PaginatedLiveFeeds!

    liveFeedPost(id: ID!): LiveFeed
  }

  type Mutation {
    createLiveFeed(input: LiveFeedInput!): LiveFeed!
    updateLiveFeed(input: LiveFeedInput): LiveFeed!

    addReaction(input: ReactionInput!): LiveFeed!
    togglePinPost(id: ID!): LiveFeed!
    deleteLiveFeed(id: ID!): Boolean!
  }

  type Subscription {
    liveFeedPostCreated(event: ID!): LiveFeed!
    liveFeedPostUpdated(event: ID!): LiveFeed!
  }
`;
