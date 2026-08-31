import { getSupabaseClient } from '../../../integrations/supabase/client'
import { NEWS_IMAGE_MAX_BYTES, NEWS_STORAGE_BUCKET } from '../constants/newsFeed'

export type NewsPost = {
  id: string
  title: string
  body: string
  image_path: string | null
  image_url: string | null
  author_id: string
  created_at: string
  is_read: boolean
}

function mapNewsPostRow(row: Record<string, unknown>, isRead: boolean): NewsPost {
  return {
    id: String(row.id),
    title: typeof row.title === 'string' ? row.title : '',
    body: typeof row.body === 'string' ? row.body : '',
    image_path: typeof row.image_path === 'string' ? row.image_path : null,
    image_url: typeof row.image_url === 'string' ? row.image_url : null,
    author_id: typeof row.author_id === 'string' ? row.author_id : '',
    created_at: typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
    is_read: isRead,
  }
}

export async function listNewsPosts(): Promise<NewsPost[]> {
  const supabase = getSupabaseClient()
  const { data: posts, error: postsError } = await supabase
    .from('app_news_posts')
    .select('id, title, body, image_path, image_url, author_id, created_at')
    .order('created_at', { ascending: false })

  if (postsError) {
    throw new Error(postsError.message)
  }

  const { data: reads, error: readsError } = await supabase
    .from('app_news_post_reads')
    .select('post_id')

  if (readsError) {
    throw new Error(readsError.message)
  }

  const readIds = new Set((reads ?? []).map((row) => String(row.post_id)))

  return (posts ?? []).map((row) => mapNewsPostRow(row as Record<string, unknown>, readIds.has(String(row.id))))
}

export async function countUnreadNewsPosts(): Promise<number> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase.rpc('count_unread_news_posts')
  if (error) {
    throw new Error(error.message)
  }
  return typeof data === 'number' ? data : 0
}

export async function markAllNewsPostsRead(): Promise<void> {
  const supabase = getSupabaseClient()
  const { error } = await supabase.rpc('mark_all_news_posts_read')
  if (error) {
    throw new Error(error.message)
  }
}

function newsImageExtension(file: File): string {
  const name = file.name.toLowerCase()
  if (name.endsWith('.png')) return 'png'
  if (name.endsWith('.webp')) return 'webp'
  if (name.endsWith('.gif')) return 'gif'
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'jpg'
  if (file.type === 'image/png') return 'png'
  if (file.type === 'image/webp') return 'webp'
  if (file.type === 'image/gif') return 'gif'
  return 'jpg'
}

export async function uploadNewsPostImage(postId: string, file: File): Promise<{ path: string; url: string }> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Nur Bilddateien sind erlaubt.')
  }
  if (file.size > NEWS_IMAGE_MAX_BYTES) {
    throw new Error('Bild darf maximal 3 MB gross sein.')
  }

  const supabase = getSupabaseClient()
  const ext = newsImageExtension(file)
  const path = `posts/${postId}/cover.${ext}`
  const contentType =
    file.type || (ext === 'jpg' ? 'image/jpeg' : ext === 'gif' ? 'image/gif' : `image/${ext}`)

  const { error: uploadError } = await supabase.storage.from(NEWS_STORAGE_BUCKET).upload(path, file, {
    upsert: true,
    contentType,
    cacheControl: '3600',
  })

  if (uploadError) {
    throw new Error(uploadError.message)
  }

  const { data } = supabase.storage.from(NEWS_STORAGE_BUCKET).getPublicUrl(path)
  return { path, url: data.publicUrl }
}

export async function createNewsPost(input: {
  title: string
  body: string
  imageFile?: File | null
}): Promise<string> {
  const supabase = getSupabaseClient()

  const { data, error } = await supabase.rpc('admin_create_news_post', {
    p_title: input.title.trim(),
    p_body: input.body.trim(),
    p_image_path: null,
    p_image_url: null,
  })

  if (error) {
    throw new Error(error.message)
  }

  const postId = typeof data === 'string' ? data : String(data)

  if (input.imageFile) {
    const uploaded = await uploadNewsPostImage(postId, input.imageFile)
    const { error: imageError } = await supabase.rpc('admin_update_news_post_image', {
      p_post_id: postId,
      p_image_path: uploaded.path,
      p_image_url: uploaded.url,
    })
    if (imageError) {
      throw new Error(imageError.message)
    }
  }

  return postId
}

async function removeNewsPostImage(path: string | null | undefined): Promise<void> {
  if (!path?.trim()) {
    return
  }
  const supabase = getSupabaseClient()
  const { error } = await supabase.storage.from(NEWS_STORAGE_BUCKET).remove([path.trim()])
  if (error) {
    throw new Error(error.message)
  }
}

export async function updateNewsPost(input: {
  postId: string
  title: string
  body: string
  imageFile?: File | null
  removeImage?: boolean
  existingImagePath?: string | null
}): Promise<void> {
  const supabase = getSupabaseClient()

  if (input.removeImage) {
    await removeNewsPostImage(input.existingImagePath)
    const { error } = await supabase.rpc('admin_update_news_post', {
      p_post_id: input.postId,
      p_title: input.title.trim(),
      p_body: input.body.trim(),
      p_image_path: null,
      p_image_url: null,
      p_clear_image: true,
    })
    if (error) {
      throw new Error(error.message)
    }
    return
  }

  if (input.imageFile) {
    const uploaded = await uploadNewsPostImage(input.postId, input.imageFile)
    if (input.existingImagePath && input.existingImagePath !== uploaded.path) {
      await removeNewsPostImage(input.existingImagePath)
    }
    const { error } = await supabase.rpc('admin_update_news_post', {
      p_post_id: input.postId,
      p_title: input.title.trim(),
      p_body: input.body.trim(),
      p_image_path: uploaded.path,
      p_image_url: uploaded.url,
      p_clear_image: false,
    })
    if (error) {
      throw new Error(error.message)
    }
    return
  }

  const { error } = await supabase.rpc('admin_update_news_post', {
    p_post_id: input.postId,
    p_title: input.title.trim(),
    p_body: input.body.trim(),
    p_image_path: null,
    p_image_url: null,
    p_clear_image: false,
  })
  if (error) {
    throw new Error(error.message)
  }
}

export async function deleteNewsPost(post: Pick<NewsPost, 'id' | 'image_path'>): Promise<void> {
  const supabase = getSupabaseClient()
  await removeNewsPostImage(post.image_path)
  const { error } = await supabase.rpc('admin_delete_news_post', {
    p_post_id: post.id,
  })
  if (error) {
    throw new Error(error.message)
  }
}
