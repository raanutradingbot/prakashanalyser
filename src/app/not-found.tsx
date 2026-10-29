import Link from "next/link";

export default function NotFound() {
  return (
    <div className="wrap problem">
      <h1>This page doesn&apos;t exist</h1>
      <p>Search for a US stock or ETF ticker from the box at the top.</p>
      <p>
        <Link href="/">Go to the home page</Link>
      </p>
    </div>
  );
}
