export default function ChatSkeleton() {
  return (
    <div className="flex-1 p-4 space-y-4">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className={`flex ${i % 2 ? 'justify-end' : 'justify-start'}`}>
          <div className={`hush-skeleton h-12 ${i % 2 ? 'w-[55%]' : 'w-[45%]'}`} />
        </div>
      ))}
    </div>
  );
}
