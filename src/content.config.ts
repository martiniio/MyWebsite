import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blog = defineCollection({
  loader: glob({ base: './src/content/blog', pattern: '**/*.{md,mdx}' }),
  schema: z.object({
    title: z.string(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    tags: z.array(z.string()).optional(),
    description: z.string().optional(),
  }),
});


const about = defineCollection({
  loader: glob({ base: './src/content/about', pattern: '**/*.{md,mdx}' }),
  schema: z.object({
    title: z.string().optional(),
  }),
});

export const collections = { blog , about };