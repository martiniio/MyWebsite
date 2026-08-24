import { visit } from 'unist-util-visit';

export default function rehypeWrapTables() {
  return function (tree) {
    visit(tree, 'element', (node, index, parent) => {
      if (node.tagName === 'table' && parent) {
        const parentIsTableWrapper = parent.tagName === 'div' && 
          parent.properties && 
          Array.isArray(parent.properties.className) && 
          parent.properties.className.includes('table-wrapper');
        
        if (!parentIsTableWrapper) {
          const wrapper = {
            type: 'element',
            tagName: 'div',
            properties: {
              className: ['table-wrapper']
            },
            children: [node]
          };
          parent.children[index] = wrapper;
        }
      }
    });
  };
}