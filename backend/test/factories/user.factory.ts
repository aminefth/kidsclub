import { IUser } from '../../models/user.model';
import { faker } from '@faker-js/faker';

export interface UserFactoryOptions {
  role?: 'admin' | 'user' | 'moderator' | 'author';
  isVerified?: boolean;
  isKidsAccount?: boolean;
  ageGroup?: 'kids-6-8' | 'kids-9-12' | 'kids-13-16' | 'adult';
  country?: string;
}

export class UserFactory {
  static create(options: UserFactoryOptions = {}): Partial<IUser> {
    const isKids = options.isKidsAccount || false;
    const ageGroup = options.ageGroup || 'adult';
    
    // Generate age-appropriate birth date
    let dateOfBirth: Date;
    switch (ageGroup) {
      case 'kids-6-8':
        dateOfBirth = faker.date.birthdate({ min: 6, max: 8, mode: 'age' });
        break;
      case 'kids-9-12':
        dateOfBirth = faker.date.birthdate({ min: 9, max: 12, mode: 'age' });
        break;
      case 'kids-13-16':
        dateOfBirth = faker.date.birthdate({ min: 13, max: 16, mode: 'age' });
        break;
      default:
        dateOfBirth = faker.date.birthdate({ min: 18, max: 65, mode: 'age' });
    }

    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    const email = faker.internet.email({ firstName, lastName });
    const username = faker.internet.userName({ firstName, lastName });

    return {
      name: `${firstName} ${lastName}`,
      email: email.toLowerCase(),
      password: 'TestPassword123!',
      username: username.toLowerCase(),
      phoneNumber: faker.phone.number(),
      dateOfBirth,
      country: options.country || faker.location.country(),
      bio: isKids ? 
        faker.lorem.sentence(5) : 
        faker.lorem.paragraph(2),
      role: options.role || 'user',
      status: 'active',
      isVerified: options.isVerified ?? false,
      isBanned: false,
      isSuspended: false,
      isDeleted: false,
      avatar: {
        public_id: faker.string.uuid(),
        url: faker.image.avatar()
      },
      account_info: {
        total_posts: faker.number.int({ min: 0, max: 100 }),
        total_reads: faker.number.int({ min: 0, max: 1000 })
      },
      google_auth: faker.datatype.boolean(),
      interests: faker.helpers.arrayElements([
        'technology', 'science', 'mathematics', 'art', 'music',
        'sports', 'reading', 'gaming', 'cooking', 'travel'
      ], { min: 1, max: 5 }),
      socialLinks: {
        website: faker.internet.url(),
        twitter: faker.internet.userName(),
        linkedin: faker.internet.userName(),
        github: faker.internet.userName()
      },
      lastActive: faker.date.recent(),
      blogs: [],
      followers: [],
      following: [],
      notifications: []
    };
  }

  static createKidsUser(ageGroup: 'kids-6-8' | 'kids-9-12' | 'kids-13-16' = 'kids-9-12'): Partial<IUser> {
    return this.create({
      isKidsAccount: true,
      ageGroup,
      role: 'user',
      isVerified: true // Kids accounts require parental verification
    });
  }

  static createCreator(): Partial<IUser> {
    return this.create({
      role: 'author',
      isVerified: true
    });
  }

  static createAdmin(): Partial<IUser> {
    return this.create({
      role: 'admin',
      isVerified: true
    });
  }

  static createModerator(): Partial<IUser> {
    return this.create({
      role: 'moderator',
      isVerified: true
    });
  }

  static createBatch(count: number, options: UserFactoryOptions = {}): Partial<IUser>[] {
    return Array.from({ length: count }, () => this.create(options));
  }
}
