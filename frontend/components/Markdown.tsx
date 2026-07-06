import ReactMarkdown from 'react-markdown';

export function Markdown({
  text,
  color = '#c4dcd0',
  fontSize = 13,
  lineHeight = 1.6,
}: {
  text: string;
  color?: string;
  fontSize?: number;
  lineHeight?: number;
}) {
  return (
    <div style={{ fontSize, color, lineHeight }}>
      <ReactMarkdown
        components={{
          p: ({ children }) => <p style={{ margin: '0 0 8px', lineHeight }}>{children}</p>,
          strong: ({ children }) => <strong style={{ color: '#eafff5', fontWeight: 700 }}>{children}</strong>,
          ul: ({ children }) => <ul style={{ margin: '4px 0 10px', paddingLeft: 20 }}>{children}</ul>,
          ol: ({ children }) => <ol style={{ margin: '4px 0 10px', paddingLeft: 20 }}>{children}</ol>,
          li: ({ children }) => <li style={{ marginBottom: 5 }}>{children}</li>,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
