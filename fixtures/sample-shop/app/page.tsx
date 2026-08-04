import { Footer } from "../components/Footer";
import { NewsletterForm } from "../components/NewsletterForm";
import { ProductCard } from "../components/ProductCard";

export default function HomePage() {
  return (
    <main>
      <header>
        <img src="/summer-sale-banner.png" width={960} height={240} />
        <a href="/cart">
          <svg viewBox="0 0 24 24" width={24} height={24}>
            <path d="M6 6h15l-1.5 9h-12z" />
          </svg>
        </a>
      </header>
      <section>
        <h1>Featured products</h1>
        <ProductCard name="Trail runner shoes" price="89€" image="/shoes.png" />
        <ProductCard name="Insulated bottle" price="25€" image="/bottle.png" />
      </section>
      <NewsletterForm />
      <Footer />
    </main>
  );
}
