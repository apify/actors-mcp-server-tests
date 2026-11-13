import { setTimeout } from 'node:timers/promises';

import { Actor, log } from 'apify';

import type { Input } from './input-schema.js';
import { computeOperations } from './math-operations.js';

/**
 * Fictional Apify book fixture. `reviews[]` is intentionally heterogeneous (optional `rating`
 * and `reviewer` appear on only some entries) so schema inference produces indexed paths like
 * `reviews.0.rating`, `reviews.1.reviewer.name`.
 */
interface Review {
    quote: string;
    source: string;
    rating?: number;
    reviewer?: { name: string };
}

interface ApifyBook {
    title: string;
    author: string;
    pages: number;
    rating: number;
    inStock: boolean;
    scrapedAt: string;
    tags: string[];
    publication: { year: number; publisher: { name: string; city: string } };
    reviews: Review[];
    '#_internal': { sourceUrl: string; runId: string };
}

const APIFY_BOOK_FIXTURE: ApifyBook[] = [
    {
        title: 'async/await and Other Lies I Told My Scraper',
        author: 'Nadia "node_modules" Petrov',
        pages: 1337,
        rating: 4.2,
        inStock: true,
        scrapedAt: '2026-05-26T09:12:00.000Z',
        tags: ['async', 'scraping-noir', 'callback-hell'],
        publication: { year: 2025, publisher: { name: 'Apify Press', city: 'Prague' } },
        reviews: [
            { quote: 'Better than the Node.js docs. Also longer.', source: 'JavaScript Weekly' },
            { quote: 'Made me cry at the memory leak chapter.', source: 'Headless Times', rating: 5 },
        ],
        '#_internal': { sourceUrl: 'https://fakebooks.example.com/async-await', runId: 'fixture-run-001' },
    },
    {
        title: 'PhantomJS Has Left the Building',
        author: 'James Crawford',
        pages: 423,
        rating: 3.9,
        inStock: false,
        scrapedAt: '2026-05-26T09:12:01.000Z',
        tags: ['headless', 'deprecated', 'last-render'],
        publication: { year: 2024, publisher: { name: 'Cheerio House', city: 'San Francisco' } },
        reviews: [
            { quote: 'Surprisingly, no robots.txt was violated in the making of this book.', source: 'Legal Weekly' },
        ],
        '#_internal': { sourceUrl: 'https://fakebooks.example.com/phantomjs', runId: 'fixture-run-001' },
    },
    {
        title: 'Wake. Code. Soylent. Repeat.',
        author: 'Mira Botev',
        pages: 210,
        rating: 4.7,
        inStock: true,
        scrapedAt: '2026-05-26T09:12:02.000Z',
        tags: ['startup-grind', 'yc-noir', 'meal-replacement'],
        publication: { year: 2025, publisher: { name: 'Event Loop Press', city: 'Prague' } },
        reviews: [
            {
                quote: 'I asked my agent to summarize this book. It opened 4,000 tabs and ordered beer.',
                source: 'Prompt Quarterly',
                reviewer: { name: 'crashcart' },
            },
        ],
        '#_internal': { sourceUrl: 'https://fakebooks.example.com/wake-code-soylent', runId: 'fixture-run-001' },
    },
];

// 1x1 transparent PNG, ~67 bytes. Used to exercise binary Content-Type preservation in KV.
const COVER_PNG_BUFFER = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVQYV2NgAAIAAAUAAarVyFEAAAAASUVORK5CYII=',
    'base64',
);

/**
 * Runs one Apify API call and logs how long it took. The calls run one after another, so the last line in the log
 * of a stuck run names the call before the stuck one, and a retried call shows as a long duration.
 */
export async function logged<T>(step: string, call: () => Promise<T>): Promise<T> {
    const startedAt = Date.now();
    const result = await call();
    log.info(step, { durationMillis: Date.now() - startedAt });
    return result;
}

export async function runNormal({ firstNumber, secondNumber, waitSeconds, maxBooks }: Input): Promise<void> {
    await logged('Set status message', async () => Actor.setStatusMessage('Processing'));

    if (waitSeconds > 0) {
        log.info(`Waiting ${waitSeconds}s before computing sum`);
        await setTimeout(waitSeconds * 1000);
    }

    const sum = firstNumber + secondNumber;
    log.info('Computed sum', { firstNumber, secondNumber, sum });

    const operations = computeOperations(firstNumber, secondNumber);
    await logged('Pushed sum item', async () => Actor.pushData({ firstNumber, secondNumber, sum, ...operations }));

    const books = APIFY_BOOK_FIXTURE.slice(0, maxBooks);
    log.info('Pushing Apify book fixture', { count: books.length });
    const booksDataset = await logged('Opened books dataset', async () => Actor.openDataset({ alias: 'books' }));
    await logged('Pushed books', async () => booksDataset.pushData(books));

    const totalRating = books.reduce((acc, b) => acc + b.rating, 0);
    await logged('Stored RESULT', async () => Actor.setValue('RESULT', { sum }));
    await logged('Stored STATS', async () =>
        Actor.setValue('STATS', {
            bookCount: books.length,
            totalRating,
            averageRating: books.length === 0 ? null : totalRating / books.length,
        }),
    );
    await logged('Stored LOG', async () =>
        Actor.setValue('LOG', `Scrape finished. ${books.length} book(s) pushed.`, {
            contentType: 'text/plain',
        }),
    );
    await logged('Stored COVER', async () => Actor.setValue('COVER', COVER_PNG_BUFFER, { contentType: 'image/png' }));

    await Actor.exit('Successfully completed');
}
