import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { SkillsicClient } from './client.js';

const client = new SkillsicClient();

export function createServer(): Server {
  const server = new Server(
    {
      name: 'skillsic',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'search_skills',
          description: 'Search for Claude Code skills by keyword. Returns matching skills with ratings and install commands.',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Search query (e.g., "rust", "web development", "deployment")',
              },
            },
            required: ['query'],
          },
        },
        {
          name: 'get_skill',
          description: 'Get detailed information about a specific skill including AI analysis and rating.',
          inputSchema: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                description: 'Skill ID in format "owner/repo" (e.g., "vercel-labs/agent-skills")',
              },
            },
            required: ['id'],
          },
        },
        {
          name: 'get_top_skills',
          description: 'Get the highest rated skills from skillsic.',
          inputSchema: {
            type: 'object',
            properties: {
              limit: {
                type: 'number',
                description: 'Number of skills to return (default: 5, max: 20)',
              },
            },
          },
        },
        {
          name: 'get_skills_by_category',
          description: 'Get skills in a specific category.',
          inputSchema: {
            type: 'object',
            properties: {
              category: {
                type: 'string',
                description: 'Category name (e.g., "web", "blockchain", "programming")',
              },
            },
            required: ['category'],
          },
        },
        {
          name: 'get_categories',
          description: 'Get all available skill categories.',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'install_skill',
          description: 'Get the install command for a skill. Returns the npx command to run.',
          inputSchema: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                description: 'Skill ID in format "owner/repo"',
              },
            },
            required: ['id'],
          },
        },
      ],
    };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    switch (name) {
      case 'search_skills': {
        const query = (args as { query: string }).query;
        const results = await client.searchSkills(query);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                results.map((r) => ({
                  id: r.skill.id,
                  name: r.skill.name,
                  description: r.skill.description,
                  rating: r.skill.analysis?.ratings.overall ?? 'unrated',
                  category: r.skill.analysis?.primary_category ?? 'unknown',
                  tags: r.skill.analysis?.tags ?? [],
                  install: client.getInstallCommand(r.skill),
                  relevance: r.relevance_score,
                })),
                null,
                2
              ),
            },
          ],
        };
      }

      case 'get_skill': {
        const id = (args as { id: string }).id;
        const skill = await client.getSkill(id);
        if (!skill) {
          return {
            content: [{ type: 'text', text: `Skill "${id}" not found.` }],
            isError: true,
          };
        }
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  id: skill.id,
                  name: skill.name,
                  description: skill.description,
                  stars: skill.stars,
                  install: client.getInstallCommand(skill),
                  install_count: skill.install_count,
                  analysis: skill.analysis
                    ? {
                        rating: skill.analysis.ratings.overall,
                        category: skill.analysis.primary_category,
                        tags: skill.analysis.tags,
                        summary: skill.analysis.summary,
                        strengths: skill.analysis.strengths,
                        weaknesses: skill.analysis.weaknesses,
                        use_cases: skill.analysis.use_cases,
                        compatibility: skill.analysis.compatibility_notes,
                        flags: skill.analysis.ratings.flags,
                      }
                    : null,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case 'get_top_skills': {
        const limit = Math.min((args as { limit?: number }).limit ?? 5, 20);
        const skills = await client.getTopRatedSkills(limit);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                skills.map((s) => ({
                  id: s.id,
                  name: s.name,
                  rating: s.analysis?.ratings.overall ?? 'unrated',
                  description: s.description,
                  install: client.getInstallCommand(s),
                })),
                null,
                2
              ),
            },
          ],
        };
      }

      case 'get_skills_by_category': {
        const category = (args as { category: string }).category;
        const skills = await client.getSkillsByCategory(category);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                skills.map((s) => ({
                  id: s.id,
                  name: s.name,
                  rating: s.analysis?.ratings.overall ?? 'unrated',
                  description: s.description,
                  install: client.getInstallCommand(s),
                })),
                null,
                2
              ),
            },
          ],
        };
      }

      case 'get_categories': {
        const categories = await client.getCategories();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ categories }, null, 2),
            },
          ],
        };
      }

      case 'install_skill': {
        const id = (args as { id: string }).id;
        const skill = await client.getSkill(id);
        if (!skill) {
          return {
            content: [{ type: 'text', text: `Skill "${id}" not found.` }],
            isError: true,
          };
        }
        const cmd = client.getInstallCommand(skill);
        return {
          content: [
            {
              type: 'text',
              text: `To install "${skill.name}", run:\n\n${cmd}\n\nThis will add the skill to your Claude Code configuration.`,
            },
          ],
        };
      }

      default:
        return {
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  });

  return server;
}

export async function runServer(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
