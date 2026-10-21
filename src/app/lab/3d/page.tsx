import { notFound } from 'next/navigation';
import { Lab3D } from './Lab3D';

// Development-only page for checking the 3D mannequin and garments from fixed
// angles. Not reachable in production.
export default function Page() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <Lab3D />;
}
