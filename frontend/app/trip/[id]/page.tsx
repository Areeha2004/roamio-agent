import SharedTrip from "@/components/SharedTrip";

// Shareable trip page: /trip/<share_id> loads a saved itinerary from the backend.
export default async function TripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SharedTrip id={id} />;
}
