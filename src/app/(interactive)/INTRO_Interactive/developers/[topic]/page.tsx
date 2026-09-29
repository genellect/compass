import { notFound } from "next/navigation";
import { EngineeringDocs, engineeringMetadata, topics, type Topic } from "../../../../../interactive/developer/EngineeringDocs";

export const dynamicParams = false;
export function generateStaticParams() {
  return Object.keys(topics).map(topic => ({ topic }));
}
function validTopic(value: string): value is Topic {
  return Object.prototype.hasOwnProperty.call(topics, value);
}
export async function generateMetadata({ params }: { params: Promise<{ topic: string }> }) {
  const { topic } = await params;
  if (!validTopic(topic)) notFound();
  return engineeringMetadata(topic);
}
export default async function TechnicalPage({ params }: { params: Promise<{ topic: string }> }) {
  const { topic } = await params;
  if (!validTopic(topic)) notFound();
  return <EngineeringDocs topic={topic} />;
}
