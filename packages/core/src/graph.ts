/**
 * Dependency graph with topological sort and cycle detection.
 *
 * Nodes are dress IDs. An edge A → B means A depends on B.
 */

export class DependencyGraph {
  private nodes = new Map<string, Set<string>>();

  addNode(id: string): void {
    if (!this.nodes.has(id)) {
      this.nodes.set(id, new Set());
    }
  }

  addDependency(from: string, to: string): void {
    this.addNode(from);
    this.addNode(to);
    this.nodes.get(from)!.add(to);
  }

  /**
   * Return nodes in topological order (dependencies first).
   * Throws if a cycle is detected.
   */
  sort(): string[] {
    // Kahn's algorithm
    const inDegree = new Map<string, number>();
    for (const id of this.nodes.keys()) {
      inDegree.set(id, 0);
    }
    for (const deps of this.nodes.values()) {
      for (const dep of deps) {
        inDegree.set(dep, (inDegree.get(dep) ?? 0) + 1);
      }
    }

    const queue: string[] = [];
    for (const [id, deg] of inDegree) {
      if (deg === 0) queue.push(id);
    }

    const sorted: string[] = [];
    while (queue.length > 0) {
      const node = queue.shift()!;
      sorted.push(node);
      for (const dep of this.nodes.get(node) ?? []) {
        const newDeg = (inDegree.get(dep) ?? 0) - 1;
        inDegree.set(dep, newDeg);
        if (newDeg === 0) queue.push(dep);
      }
    }

    if (sorted.length !== this.nodes.size) {
      const remaining = [...this.nodes.keys()].filter((n) => !sorted.includes(n));
      throw new Error(`Circular dependency detected: ${remaining.join(' → ')}`);
    }

    // Reverse so dependencies come first
    return sorted.reverse();
  }

  /**
   * Return all direct and transitive dependencies of a node.
   */
  dependenciesOf(id: string): string[] {
    const visited = new Set<string>();
    const visit = (nodeId: string) => {
      for (const dep of this.nodes.get(nodeId) ?? []) {
        if (!visited.has(dep)) {
          visited.add(dep);
          visit(dep);
        }
      }
    };
    visit(id);
    return [...visited];
  }

  /**
   * Return all nodes that directly or transitively depend on the given node.
   */
  dependantsOf(id: string): string[] {
    const result = new Set<string>();
    for (const [nodeId, _deps] of this.nodes) {
      if (nodeId === id) continue;
      // Check if this node transitively depends on `id`
      const transitive = this.dependenciesOf(nodeId);
      if (transitive.includes(id)) {
        result.add(nodeId);
      }
    }
    return [...result];
  }

  has(id: string): boolean {
    return this.nodes.has(id);
  }

  get size(): number {
    return this.nodes.size;
  }
}
