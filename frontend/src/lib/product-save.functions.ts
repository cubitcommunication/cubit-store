import { api } from "./api";

/**
 * Atomic product save. The product row, its slug redirect and every image row
 * are written in a single database batch, so a failure halfway through can
 * never leave a half-saved product. Images the admin removed are only deleted
 * from the database — and afterwards from the media bucket — once the batch
 * has committed, and bucket objects are deleted only when no other record
 * still references them.
 */

export type ProductSaveImage = {
  id?: string | undefined;
  image_url: string;
  alt_text: string;
};

export type ProductSaveVariant = {
  id?: string | undefined;
  options: Record<string, string>;
  sku: string | null;
  price: number | null;
  compare_at_price?: number | null;
  stock_quantity: number | null;
  image_url: string | null;
  video_url?: string | null;
};

export type ProductSaveInput = {
  id?: string | undefined;
  previousSlug?: string | undefined;
  payload: {
    name: string;
    slug: string;
    sku: string;
    price: number;
    options?: { name: string; values: string[] }[] | undefined;
    stock_quantity?: number | null | undefined;
    compare_at_price?: number | null | undefined;
    category: string;
    subcategory: string | null;
    material: string;
    description: string | null;
    where_to_wear: string | null;
    occasion: string[];
    tags?: string[];
    video_url?: string | null;
    weight_grams?: number | null;
    length_cm?: number | null;
    breadth_cm?: number | null;
    height_cm?: number | null;
    featured: boolean;
    new_arrival: boolean;
    published: boolean;
    seo_title: string | null;
    seo_description: string | null;
    seo_image_url: string | null;
  };
  images: ProductSaveImage[];
  /** Variants for the options in payload.options (empty = no variants). */
  variants?: ProductSaveVariant[];
  /** Images the admin removed in the form; deleted only after a successful save. */
  removedImages: ProductSaveImage[];
};

/** Atomic save: the PHP API writes the product, redirect and images in one transaction. */
export const saveProduct = ({ data }: { data: ProductSaveInput }) =>
  api<{ id: string; slug: string }>("/admin/products/save", { method: "POST", body: data });
