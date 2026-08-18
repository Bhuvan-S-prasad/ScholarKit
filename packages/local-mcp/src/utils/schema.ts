import { z } from "zod";

/**
 * Converts a Zod object schema into a JSON Schema object suitable for MCP tool inputSchema.
 */
export function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      const fieldSchema = value as z.ZodTypeAny;
      properties[key] = convertZodField(fieldSchema);

      if (!fieldSchema.isOptional() && !(fieldSchema instanceof z.ZodDefault)) {
        required.push(key);
      }
    }

    return {
      type: "object",
      properties,
      required: required.length > 0 ? required : undefined,
    };
  }

  return { type: "object" };
}

function convertZodField(field: z.ZodTypeAny): Record<string, unknown> {
  let current = field;
  let isOptional = false;
  let description = current.description;

  // Unwrap optionals, defaults, and nullables
  while (
    current instanceof z.ZodOptional ||
    current instanceof z.ZodNullable ||
    current instanceof z.ZodDefault
  ) {
    if (current instanceof z.ZodOptional || current instanceof z.ZodNullable) {
      isOptional = true;
    }
    if (current.description) {
      description = current.description;
    }
    if (current instanceof z.ZodOptional || current instanceof z.ZodNullable) {
      current = current.unwrap();
    } else if (current instanceof z.ZodDefault) {
      current = current._def.innerType;
    }
  }

  const result: Record<string, unknown> = {};
  if (description) {
    result.description = description;
  }

  if (current instanceof z.ZodString) {
    result.type = "string";
  } else if (current instanceof z.ZodNumber) {
    result.type = "number";
  } else if (current instanceof z.ZodBoolean) {
    result.type = "boolean";
  } else if (current instanceof z.ZodArray) {
    result.type = "array";
    result.items = convertZodField(current.element);
  } else if (current instanceof z.ZodEnum) {
    result.type = "string";
    result.enum = current.options;
  } else if (current instanceof z.ZodObject) {
    return { ...result, ...zodToJsonSchema(current) };
  } else {
    result.type = "string";
  }

  return result;
}
