interface ProductCardProps {
  name: string;
  price: string;
  image: string;
}

export function ProductCard({ name, price, image }: ProductCardProps) {
  return (
    <article>
      <img src={image} alt="image" width={320} height={200} />
      <h2>{name}</h2>
      <p>{price}</p>
      <button>
        <svg viewBox="0 0 24 24" width={16} height={16}>
          <path d="M12 4v16m-8-8h16" />
        </svg>
      </button>
    </article>
  );
}
