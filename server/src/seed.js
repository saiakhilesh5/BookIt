import mongoose from 'mongoose';
import { connectDB, disconnectDB } from './config/db.js';
import { env } from './config/env.js';
import { User } from './models/User.js';
import { Event } from './models/Event.js';
import { Booking } from './models/Booking.js';
import { Waitlist } from './models/Waitlist.js';
import { PromoCode } from './models/PromoCode.js';
import { AuditLog } from './models/AuditLog.js';
import { Mail } from './models/Mail.js';
import { generateTicketCode } from './utils/tokens.js';
import { logger } from './utils/logger.js';

const day = 24 * 60 * 60 * 1000;
const inDays = (d, hour = 19, minute = 0) => {
  const dt = new Date();
  dt.setDate(dt.getDate() + d);
  dt.setHours(hour, minute, 0, 0);
  return dt;
};
const img = (id) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1200&q=70`;

const CITY_GEO = {
  'New York': [-74.006, 40.7128],
  'San Francisco': [-122.4194, 37.7749],
  Chicago: [-87.6298, 41.8781],
  Miami: [-80.1918, 25.7617],
  Austin: [-97.7431, 30.2672],
  'San Diego': [-117.1611, 32.7157],
  Boston: [-71.0589, 42.3601],
  Phoenix: [-112.074, 33.4484],
  Seattle: [-122.3321, 47.6062],
  'Los Angeles': [-118.2437, 34.0522],
  'New Orleans': [-90.0715, 29.9511],
};

function event({ organizer, title, description, category, city, venue, inN, at = 19, hours = 3, images, tiers, status = 'published', views = 0 }) {
  const tierDocs = tiers.map(([name, price, capacity]) => ({
    name,
    price,
    capacity,
    sold: 0,
    held: 0,
    available: capacity,
  }));
  const startsAt = inDays(inN, Math.floor(at), Math.round((at % 1) * 60));
  const endsAt = new Date(startsAt.getTime() + hours * 60 * 60 * 1000);
  return {
    organizer,
    title,
    description,
    category,
    location: {
      venue,
      city,
      geo: { type: 'Point', coordinates: CITY_GEO[city] ?? [0, 0] },
    },
    startsAt,
    endsAt,
    images: [img(images)],
    status,
    tiers: tierDocs,
    views,
  };
}

async function seed() {
  await connectDB();
  const db = mongoose.connection;
  logger.info('Clearing existing data...');
  await Promise.all([User, Event, Booking, Waitlist, PromoCode, AuditLog, Mail].map((m) => m.deleteMany({})));

  const passwordHash = await User.hashPassword('Password123!');
  const mkUser = (name, email, role) => User.create({ name, email, passwordHash, role });

  logger.info('Creating users...');
  const admin = await mkUser('Ava Admin', 'admin@bookit.dev', 'admin');
  const omar = await mkUser('Omar Ortiz', 'organizer@bookit.dev', 'organizer');
  const luna = await mkUser('Luna Lin', 'luna@bookit.dev', 'organizer');
  const alex = await mkUser('Alex Rivera', 'alex@bookit.dev', 'user');
  const mia = await mkUser('Mia Chen', 'mia@bookit.dev', 'user');
  const noah = await mkUser('Noah Patel', 'noah@bookit.dev', 'user');
  const bookers = await Promise.all(
    ['sam@example.com', 'priya@example.com', 'diego@example.com', 'emma@example.com', 'kai@example.com', 'yara@example.com', 'tom@example.com', 'nina@example.com'].map(
      (email, i) => mkUser(`Booker ${i + 1}`, email, 'user'),
    ),
  );

  logger.info('Creating events...');
  const definitions = [
    event({
      organizer: omar, title: 'Neon Pulse: Electronic Night', category: 'Music', city: 'New York',
      venue: 'Brooklyn Mirage', inN: 12, at: 21, hours: 7, images: 'photo-1470229722913-7c0e2db1efe1', views: 1820,
      description: 'An immersive electronic music experience featuring three international headliners, a 360° LED stage, and late-night DJ sets until 4 AM. Doors open at 9 PM — arrive early for the opening showcase.',
      tiers: [['General Admission', 45, 300], ['VIP Lounge', 120, 80], ['Front Stage', 95, 100]],
    }),
    event({
      organizer: luna, title: 'Startup Grind Summit 2026', category: 'Tech', city: 'San Francisco',
      venue: 'Moscone Center West', inN: 20, at: 9, hours: 24, images: 'photo-1540575467063-178a50c2df87', views: 2410,
      description: 'Two days of keynotes, hands-on workshops, and investor office hours with 60+ speakers from the world\'s fastest-growing startups. Includes networking brunch and an evening pitch competition with a $50K prize pool.',
      tiers: [['Early Bird', 99, 200], ['Standard', 149, 400], ['VIP All-Access', 299, 60]],
    }),
    event({
      organizer: omar, title: 'City Marathon 2026', category: 'Sports', city: 'Chicago',
      venue: 'Grant Park — Start Line', inN: 35, at: 6, hours: 8, images: 'photo-1461896836934-ffe607ba8211', views: 3205,
      description: 'The 26.2-mile classic through Chicago\'s neighborhoods. Chip timing, six fluid stations, pacers from 3:00 to 6:00 hours, and a finisher medal for everyone. Packet pickup the day before at the expo.',
      tiers: [['Runner', 65, 800], ['VIP Runner', 110, 150]],
    }),
    event({
      organizer: luna, title: 'Taste of the Coast Food Fest', category: 'Food', city: 'Miami',
      venue: 'Bayfront Park', inN: 8, at: 12, hours: 9, images: 'photo-1504674900247-0877df9cc836', views: 1450,
      description: 'Forty of Miami\'s best restaurants, live cooking battles, a ceviche bar, and sunset cocktails on the bay. The Foodie Pass adds unlimited tastings and a reserved table at the chef showdown.',
      tiers: [['General Admission', 30, 500], ['Foodie Pass', 75, 200]],
    }),
    event({
      organizer: omar, title: 'AI & Data Engineering Bootcamp', category: 'Education', city: 'Austin',
      venue: 'Austin Convention Center', inN: 15, at: 8.5, hours: 9, images: 'photo-1524178232363-1fb2b075b655', views: 980,
      description: 'A full-day bootcamp covering LLM pipelines, vector databases, and real-time streaming with Kafka. Bring a laptop — you will ship a working RAG application before the closing session.',
      tiers: [['Student', 49, 100], ['Professional', 129, 220]],
    }),
    event({
      organizer: luna, title: 'Sunset Yoga & Wellness Retreat', category: 'Health', city: 'San Diego',
      venue: 'Sunset Cliffs Natural Park', inN: 5, at: 17.5, hours: 2.5, images: 'photo-1544367567-0f2fcb009e0b', views: 640,
      description: 'A guided vinyasa flow on the cliffs as the sun sets over the Pacific, followed by a sound-bath meditation and herbal tea circle. Mats provided; all levels welcome.',
      tiers: [['General Admission', 25, 120]],
    }),
    event({
      organizer: omar, title: 'Broadway Nights: The Musical', category: 'Arts', city: 'New York',
      venue: 'Lunt-Fontanne Theatre', inN: 18, at: 20, hours: 3, images: 'photo-1503095396549-807759245b35', views: 4102,
      description: 'The Tony-winning sensation returns for a limited eight-week run. A sweeping score, a 30-piece live orchestra, and the production the New York Times called "a once-in-a-generation triumph".',
      tiers: [['Balcony', 59, 150], ['Mezzanine', 99, 100], ['Orchestra', 159, 40]],
    }),
    event({
      organizer: luna, title: 'Venture Capital Masterclass', category: 'Business', city: 'Boston',
      venue: 'Harvard Innovation Labs', inN: 25, at: 14, hours: 5, images: 'photo-1556761175-b413da4baf72', views: 720,
      description: 'How term sheets really work: valuation mechanics, liquidation preferences, and anti-dilution — taught by three operating partners. Includes a live negotiation simulation and a networking dinner.',
      tiers: [['Standard', 199, 90]],
    }),
    event({
      organizer: omar, title: 'Desert Trails Adventure Hike', category: 'Travel', city: 'Phoenix',
      venue: 'Camelback Mountain — Echo Canyon', inN: 30, at: 5.5, hours: 5, images: 'photo-1488646953014-85cb44e25828', views: 510,
      description: 'A guided sunrise summit of Camelback Mountain with a certified desert guide, followed by a saguaro forest loop and a picnic breakfast at the trailhead. Moderate difficulty — bring 2L of water.',
      tiers: [['General Admission', 40, 60]],
    }),
    event({
      organizer: luna, title: 'Indie Rock Basement Sessions', category: 'Music', city: 'Seattle',
      venue: 'The Crocodile — Back Room', inN: 10, at: 20.5, hours: 4, images: 'photo-1493225457124-a3eb161ffa5f', views: 1130,
      description: 'Three of the Pacific Northwest\'s loudest indie bands, one room, no barriers. Limited to 180 people — this always sells out. Doors at 8 PM, first set at 9 PM sharp.',
      tiers: [['General Admission', 28, 140], ['VIP Balcony', 60, 40]],
    }),
    event({
      organizer: omar, title: 'Championship Basketball Finals — Game 1', category: 'Sports', city: 'Los Angeles',
      venue: 'Crypto.com Arena', inN: 45, at: 19, hours: 3, images: 'photo-1546519638-68e109498ffc', views: 5230,
      description: 'Game 1 of the finals. Two juggernauts, one roof. Courtside seats include tunnel access and the post-game press conference. Ticket includes entry to the pre-game plaza festival.',
      tiers: [['Upper Deck', 90, 600], ['Courtside', 350, 80]],
    }),
    event({
      organizer: luna, title: 'Modern Art Biennale Opening Night', category: 'Arts', city: 'Chicago',
      venue: 'Museum of Contemporary Art', inN: 60, at: 18, hours: 3, images: 'photo-1513364776144-60967b0f800f', views: 890,
      description: 'Be the first to see 80 new works from 24 countries, with the artists in attendance. Curator-led tours every 30 minutes, live performance art in the sculpture garden, and a champagne reception.',
      tiers: [['General Admission', 22, 300]],
    }),
  ];

  const events = await Event.insertMany(definitions);

  // Extra lifecycle states for the admin demo
  await Event.create({
    ...event({
      organizer: omar, title: 'Crypto & Web3 Forum 2026', category: 'Tech', city: 'Miami',
      venue: 'Miami Beach Convention Center', inN: 28, at: 9, hours: 9, images: 'photo-1639762681485-074b7f938ba0', views: 120,
      description: 'Regulation, custody, and the institutional roadmap for digital assets — 40 speakers across two stages, plus a developer hackathon running all weekend.',
      tiers: [['Standard', 129, 400], ['Workshop Pass', 249, 100]],
    }),
    status: 'pending',
  });
  await Event.create({
    ...event({
      organizer: luna, title: 'Autumn Jazz Evening', category: 'Music', city: 'New Orleans',
      venue: 'Snug Harbor Jazz Bistro', inN: 22, at: 19.5, hours: 3, images: 'photo-1415201364774-f6f0bb35f28f', views: 45,
      description: 'An intimate trio set — piano, upright bass, brushes — in the birthplace of jazz. Two seatings, Creole small plates, and a 90-minute set of standards and originals.',
      tiers: [['Table Seat', 55, 60]],
    }),
    status: 'draft',
  });

  logger.info('Creating bookings...');
  const byTitle = (t) => events.find((e) => e.title === t);
  const neon = byTitle('Neon Pulse: Electronic Night');
  const grind = byTitle('Startup Grind Summit 2026');
  const broadway = byTitle('Broadway Nights: The Musical');
  const indie = byTitle('Indie Rock Basement Sessions');
  const marathon = byTitle('City Marathon 2026');

  async function confirm(user, ev, tierName, quantity, daysAgo) {
    const tier = ev.tiers.find((t) => t.name === tierName);
    const createdAt = new Date(Date.now() - daysAgo * day);
    const total = tier.price * quantity;
    await Booking.create({
      user: user._id, event: ev._id, tierId: tier._id, tierName: tier.name,
      quantity, unitPrice: tier.price, discountAmount: 0, totalAmount: total,
      status: 'confirmed', idempotencyKey: `seed:${user._id}:${ev._id}:${tier._id}:${Math.random().toString(36).slice(2, 8)}`,
      payment: { method: 'mock_card', ref: `pi_seed_${Math.random().toString(36).slice(2, 10)}`, paidAt: createdAt },
      ticketCode: generateTicketCode(), createdAt, updatedAt: createdAt,
    });
    tier.sold += quantity;
    tier.available -= quantity;
  }

  await confirm(alex, neon, 'General Admission', 2, 3);
  await confirm(mia, neon, 'VIP Lounge', 1, 2);
  await confirm(alex, grind, 'Early Bird', 1, 5);
  await confirm(noah, broadway, 'Balcony', 4, 6);
  await confirm(mia, broadway, 'Mezzanine', 2, 4);
  await confirm(alex, indie, 'General Admission', 2, 1);
  await confirm(noah, marathon, 'VIP Runner', 1, 7);

  // Fill the sold-out Orchestra tier with background bookers so dashboards look alive.
  const orchestra = broadway.tiers.find((t) => t.name === 'Orchestra');
  const otherBuyers = [mia, noah, ...bookers];
  let i = 0;
  while (orchestra.available >= 4) {
    await confirm(otherBuyers[i % otherBuyers.length], broadway, 'Orchestra', 4, 2 + (i % 10));
    i++;
  }

  for (const ev of [neon, grind, broadway, indie, marathon, byTitle('Championship Basketball Finals — Game 1')]) {
    await ev.save();
  }

  logger.info('Creating waitlist + promos...');
  const orchestraTier = broadway.tiers.find((t) => t.name === 'Orchestra');
  await Waitlist.create({ user: alex._id, event: broadway._id, tierId: orchestraTier._id, quantity: 1 });
  await Waitlist.create({ user: noah._id, event: broadway._id, tierId: orchestraTier._id, quantity: 2 });

  await PromoCode.create([
    { code: 'WELCOME10', type: 'percent', value: 10, maxUses: 500, expiresAt: inDays(90), createdBy: admin._id },
    { code: 'FLAT20', type: 'flat', value: 20, maxUses: 100, expiresAt: inDays(60), createdBy: admin._id },
    { code: 'GRIND15', type: 'percent', value: 15, maxUses: 50, expiresAt: inDays(20), event: grind._id, createdBy: luna._id },
  ]);

  logger.info('Writing seed audit trail...');
  await AuditLog.insertMany([
    { actor: omar._id, actorLabel: 'Omar Ortiz (organizer)', action: 'event.created', entityType: 'Event', entityId: neon._id, meta: { status: 'published' } },
    { actor: luna._id, actorLabel: 'Luna Lin (organizer)', action: 'event.created', entityType: 'Event', entityId: grind._id, meta: { status: 'published' } },
    { actor: admin._id, actorLabel: 'Ava Admin (admin)', action: 'user.role_changed', entityType: 'User', entityId: luna._id, meta: { role: 'organizer' } },
  ]);

  const counts = {
    users: await User.countDocuments(),
    events: await Event.countDocuments(),
    bookings: await Booking.countDocuments(),
    waitlist: await Waitlist.countDocuments(),
    promos: await PromoCode.countDocuments(),
  };
  logger.info({ counts }, 'Seed complete');
  logger.info('Demo accounts (password: Password123!):');
  logger.info('  admin@bookit.dev     — admin');
  logger.info('  organizer@bookit.dev — organizer');
  logger.info('  alex@bookit.dev      — user');
  await disconnectDB();
}

seed().catch((err) => {
  logger.error({ err }, 'Seed failed');
  process.exit(1);
});
