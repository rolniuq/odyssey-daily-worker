/**
 * The OdysseyDB curriculum: an ordered list of PostgreSQL documentation
 * sections, one per lesson/day. The worker walks this list sequentially,
 * pointing `progress.json` at the next lesson to create.
 *
 * Each entry keeps ONE doc = ONE lesson, in the official-docs order we agreed
 * on. The model generates the full page (title, concept, objectives, quiz,
 * Feynman body) from the metadata below plus the referenced docs page.
 */

export interface CurriculumItem {
  /** Globally increasing lesson number in the OdysseyDB site. */
  order: number;
  /** Filename slug (glued into a zero-padded MDX file name). */
  slug: string;
  /** Working title the worker can use in the commit/PR. */
  title: string;
  /** Official PostgreSQL documentation page title. */
  docTitle: string;
  /** Official documentation URL. */
  docSource: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
}

/**
 * Ordered by how a newcomer should learn PostgreSQL — one concept each day.
 * Lesson 1 already exists in OdysseyDB, so this starts at lesson 2.
 */
export const CURRICULUM: CurriculumItem[] = [
  {
    order: 2,
    slug: 'client-server-architecture',
    title: 'PostgreSQL is a client/server system',
    docTitle: 'Architectural Fundamentals',
    docSource: 'https://www.postgresql.org/docs/current/tutorial-arch.html',
    difficulty: 'beginner',
  },
  {
    order: 3,
    slug: 'connecting-with-psql',
    title: 'Connecting to a database with psql',
    docTitle: 'Accessing a Database',
    docSource: 'https://www.postgresql.org/docs/current/tutorial-accessdb.html',
    difficulty: 'beginner',
  },
  {
    order: 4,
    slug: 'create-database-and-tables',
    title: 'Creating a database and its tables',
    docTitle: 'Creating a Database / Creating a New Table',
    docSource: 'https://www.postgresql.org/docs/current/tutorial-createdb.html',
    difficulty: 'beginner',
  },
  {
    order: 5,
    slug: 'data-types',
    title: 'Picking the right data types',
    docTitle: 'Data Types',
    docSource: 'https://www.postgresql.org/docs/current/datatype.html',
    difficulty: 'beginner',
  },
  {
    order: 6,
    slug: 'select-rows',
    title: 'Reading rows back with SELECT',
    docTitle: '2.5. Querying a Table',
    docSource: 'https://www.postgresql.org/docs/current/tutorial-select.html',
    difficulty: 'beginner',
  },
  {
    order: 7,
    slug: 'where-and-filtering',
    title: 'Filtering rows with WHERE',
    docTitle: 'The WHERE clause',
    docSource: 'https://www.postgresql.org/docs/current/queries-table-expressions.html',
    difficulty: 'beginner',
  },
  {
    order: 8,
    slug: 'ordering-and-limiting',
    title: 'Ordering and limiting results',
    docTitle: 'ORDER BY and LIMIT',
    docSource: 'https://www.postgresql.org/docs/current/queries-order.html',
    difficulty: 'beginner',
  },
  {
    order: 9,
    slug: 'joins',
    title: 'Joining tables: the ON clause',
    docTitle: '2.6. Joins Between Tables',
    docSource: 'https://www.postgresql.org/docs/current/tutorial-join.html',
    difficulty: 'intermediate',
  },
  {
    order: 10,
    slug: 'group-by-aggregates',
    title: 'Grouping rows and computing aggregates',
    docTitle: '2.7. Aggregate Functions',
    docSource: 'https://www.postgresql.org/docs/current/tutorial-agg.html',
    difficulty: 'intermediate',
  },
  {
    order: 11,
    slug: 'transactions',
    title: 'Transactions: all-or-nothing',
    docTitle: '2.4. Transactions',
    docSource: 'https://www.postgresql.org/docs/current/tutorial-transactions.html',
    difficulty: 'intermediate',
  },
  {
    order: 12,
    slug: 'indexes',
    title: 'Indexes: making lookups fast',
    docTitle: 'Indexes',
    docSource: 'https://www.postgresql.org/docs/current/indexes.html',
    difficulty: 'intermediate',
  },
  {
    order: 13,
    slug: 'explain-a-query-plan',
    title: 'EXPLAIN: reading a query plan',
    docTitle: 'Using EXPLAIN',
    docSource: 'https://www.postgresql.org/docs/current/using-explain.html',
    difficulty: 'advanced',
  },
  {
    order: 14,
    slug: 'mvcc-isolation',
    title: 'MVCC and isolation levels',
    docTitle: 'Concurrency Control',
    docSource: 'https://www.postgresql.org/docs/current/mvcc-intro.html',
    difficulty: 'advanced',
  },
  {
    order: 15,
    slug: 'json-documents',
    title: 'Working with JSON',
    docTitle: 'JSON Types',
    docSource: 'https://www.postgresql.org/docs/current/datatype-json.html',
    difficulty: 'intermediate',
  },
];

export type Curriculum = CurriculumItem[];

export function curriculumFor(order: number): CurriculumItem | undefined {
  return CURRICULUM.find((l) => l.order === order);
}
