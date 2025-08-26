import { IBlog } from '../../models/blogs.model';
import { faker } from '@faker-js/faker';
import { Types } from 'mongoose';

export interface BlogFactoryOptions {
  authorId?: string;
  isKidsContent?: boolean;
  ageGroup?: 'kids-6-8' | 'kids-9-12' | 'kids-13-16' | 'general';
  educationalLevel?: 'beginner' | 'intermediate' | 'advanced';
  isPublished?: boolean;
  category?: string;
  featured?: boolean;
}

export class BlogFactory {
  static create(options: BlogFactoryOptions = {}): Partial<IBlog> {
    const isKids = options.isKidsContent || false;
    const ageGroup = options.ageGroup || 'general';
    
    // Generate age-appropriate content
    const title = isKids ? 
      faker.helpers.arrayElement([
        'Fun Science Experiments for Kids',
        'Learning Math with Games',
        'Amazing Animal Facts',
        'Space Adventures for Young Explorers',
        'Creative Art Projects'
      ]) : 
      faker.lorem.sentence(4);

    const description = isKids ?
      faker.lorem.sentences(2, ' ') :
      faker.lorem.paragraph(1);

    const tags = isKids ?
      faker.helpers.arrayElements([
        'kids', 'education', 'fun', 'learning', 'science',
        'math', 'art', 'games', 'activities', 'family'
      ], { min: 3, max: 6 }) :
      faker.helpers.arrayElements([
        'technology', 'programming', 'business', 'lifestyle',
        'health', 'travel', 'food', 'finance', 'career'
      ], { min: 2, max: 5 });

    return {
      blog_id: faker.string.uuid(),
      title,
      des: description,
      banner: faker.image.url({ width: 1200, height: 600 }),
      content: [
        {
          type: 'paragraph',
          content: faker.lorem.paragraphs(3, '\n\n')
        }
      ],
      tags,
      author: new Types.ObjectId(options.authorId),
      draft: !options.isPublished,
      isPublished: options.isPublished ?? true,
      ageGroup,
      isKidsContent: isKids,
      educationalLevel: options.educationalLevel,
      parentalGuidance: isKids && ageGroup !== 'kids-13-16',
      questions: [],
      category: options.category || faker.helpers.arrayElement([
        'Technology', 'Science', 'Education', 'Arts', 'Sports'
      ]),
      activity: {
        total_likes: faker.number.int({ min: 0, max: 500 }),
        total_comments: faker.number.int({ min: 0, max: 100 }),
        total_reads: faker.number.int({ min: 0, max: 1000 }),
        total_parent_comments: faker.number.int({ min: 0, max: 50 }),
        average_read_time: faker.number.int({ min: 60, max: 600 }),
        bounce_rate: faker.number.float({ min: 0, max: 1, precision: 0.01 }),
        engagement_score: faker.number.float({ min: 0, max: 10, precision: 0.1 })
      },
      reviews: [],
      ratings: faker.number.float({ min: 0, max: 5, precision: 0.1 }),
      viewHistory: [],
      metaDescription: description.substring(0, 160),
      slug: faker.helpers.slugify(title).toLowerCase(),
      featured: options.featured ?? false
    };
  }

  static createKidsContent(ageGroup: 'kids-6-8' | 'kids-9-12' | 'kids-13-16' = 'kids-9-12'): Partial<IBlog> {
    return this.create({
      isKidsContent: true,
      ageGroup,
      educationalLevel: 'beginner',
      category: 'Education'
    });
  }

  static createEducationalContent(): Partial<IBlog> {
    return this.create({
      category: 'Education',
      educationalLevel: faker.helpers.arrayElement(['beginner', 'intermediate', 'advanced'])
    });
  }

  static createFeaturedPost(): Partial<IBlog> {
    return this.create({
      featured: true,
      isPublished: true
    });
  }

  static createDraft(authorId: string): Partial<IBlog> {
    return this.create({
      authorId,
      isPublished: false
    });
  }

  static createBatch(count: number, options: BlogFactoryOptions = {}): Partial<IBlog>[] {
    return Array.from({ length: count }, () => this.create(options));
  }
}
