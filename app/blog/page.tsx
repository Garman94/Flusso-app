import { Navbar } from "@/components/navbar";
import { getAllPosts } from "@/lib/blog";
import { siteConfig } from "@/lib/config";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: `Blog — ${siteConfig.name}`,
  description: `Articoli, guide e aggiornamenti da ${siteConfig.name}.`,
};

export default async function BlogPage() {
  const posts = await getAllPosts();

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 w-full max-w-3xl mx-auto px-5 py-16 flex flex-col gap-12">
        <div>
          <h1 className="text-3xl font-bold">Blog</h1>
          <p className="text-muted-foreground mt-2">
            Articoli, guide e aggiornamenti.
          </p>
        </div>

        {posts.length === 0 ? (
          <p className="text-muted-foreground">Nessun articolo ancora. Torna presto!</p>
        ) : (
          <div className="flex flex-col divide-y">
            {posts.map((post) => (
              <article key={post.slug} className="py-8 flex flex-col gap-3">
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <time dateTime={post.date}>
                    {new Date(post.date).toLocaleDateString("it-IT", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </time>
                  {post.tags && post.tags.length > 0 && (
                    <>
                      <span>·</span>
                      <div className="flex gap-1">
                        {post.tags.map((tag) => (
                          <span key={tag} className="bg-muted px-2 py-0.5 rounded-full">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </>
                  )}
                </div>
                <Link href={`/blog/${post.slug}`} className="group">
                  <h2 className="text-xl font-semibold group-hover:text-primary transition-colors">
                    {post.title}
                  </h2>
                </Link>
                {post.description && (
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {post.description}
                  </p>
                )}
                <Link
                  href={`/blog/${post.slug}`}
                  className="text-sm font-medium hover:underline underline-offset-4 w-fit"
                >
                  Leggi →
                </Link>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
